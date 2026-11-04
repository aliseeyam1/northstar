
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  'https://fknbkxvylepelivrgfdc.supabase.co';

const SUPER_ADMIN_EMAIL =
  'ttesttuuser@gmail.com';

const admin = () => {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is missing. Add it in Vercel Environment Variables.'
    );
  }

  return createClient(SUPABASE_URL, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

const bad = (res: any, status: number, message: string) =>
  res.status(status).json({ error: message });

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return bad(res, 405, 'Method not allowed');
  }

  try {
    const db = admin();

    const token = String(
      req.headers.authorization || ''
    ).replace(/^Bearer\s+/i, '');

    if (!token) {
      return bad(res, 401, 'Please log in again');
    }

    const {
      data: { user },
      error: authError,
    } = await db.auth.getUser(token);

    if (authError || !user) {
      return bad(res, 401, 'Invalid session');
    }

    const { data: profile, error: pe } = await db
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (pe) {
      return bad(res, 500, pe.message);
    }

    if (
      !profile ||
      !profile.approved ||
      profile.role !== 'super_admin' ||
      user.email?.toLowerCase() !== SUPER_ADMIN_EMAIL
    ) {
      return bad(res, 403, 'Super Admin permission required');
    }

    const b = req.body || {};
    const action = b.action;

    // LIST SCHOOLS, USERS AND APPROVALS
    if (action === 'list') {
      const [schools, invites, approvals] = await Promise.all([
        db.from('schools')
          .select('*')
          .order('created_at', { ascending: false }),

        db.from('pending_invitations')
          .select('*')
          .order('created_at', { ascending: false }),

        db.from('approval_requests')
          .select('*')
          .order('created_at', { ascending: false }),
      ]);

      for (const result of [schools, invites, approvals]) {
        if (result.error) {
          return bad(res, 500, result.error.message);
        }
      }

      return res.json({
        schools: schools.data,
        users: invites.data,
        approvals: approvals.data,
      });
    }

    // CREATE SCHOOL
    if (action === 'createSchool') {
      const name = String(b.name || '').trim();
      const max = Number(b.max_students);
      const unit = String(b.duration_unit);
      const value = Number(b.duration_value);

      if (
        name.length < 2 ||
        !Number.isInteger(max) ||
        max < 1 ||
        max > 1000000 ||
        !['day', 'month', 'lifetime'].includes(unit) ||
        (
          unit !== 'lifetime' &&
          (
            !Number.isInteger(value) ||
            value < 1 ||
            value > 1200
          )
        )
      ) {
        return bad(res, 400, 'Invalid school or license details');
      }

      const { data, error } = await db
        .from('schools')
        .insert({
          name,
          email: b.email || null,
          max_students: max,
          duration_unit: unit,
          duration_value: unit === 'lifetime' ? null : value,
          subscription_status: 'pending',
        })
        .select()
        .single();

      if (error) {
        return bad(res, 400, error.message);
      }

      const approval = await db
        .from('approval_requests')
        .insert({
          school_id: data.id,
          requester_id: user.id,
          request_type: 'school_access',
          status: 'pending',
        });

      if (approval.error) {
        return bad(res, 500, approval.error.message);
      }

      return res.json({ school: data });
    }

    // APPROVE OR REJECT REQUEST
    if (action === 'decide') {
      const decision = String(b.decision);

      if (!['approved', 'rejected'].includes(decision)) {
        return bad(res, 400, 'Invalid decision');
      }

      const { data: request, error: requestError } = await db
        .from('approval_requests')
        .select('*')
        .eq('id', b.id)
        .eq('status', 'pending')
        .maybeSingle();

      if (requestError) {
        return bad(res, 500, requestError.message);
      }

      if (!request) {
        return bad(res, 404, 'Pending request not found');
      }

      if (
        request.request_type === 'school_access' &&
        request.school_id
      ) {
        const { data: school, error: schoolError } = await db
          .from('schools')
          .select('*')
          .eq('id', request.school_id)
          .single();

        if (schoolError || !school) {
          return bad(res, 404, 'School missing');
        }

        const now = new Date();
        let expiresAt: string | null = null;

        if (
          decision === 'approved' &&
          school.duration_unit !== 'lifetime'
        ) {
          const end = new Date(now);

          if (school.duration_unit === 'day') {
            end.setUTCDate(
              end.getUTCDate() + Number(school.duration_value)
            );
          } else {
            end.setUTCMonth(
              end.getUTCMonth() + Number(school.duration_value)
            );
          }

          expiresAt = end.toISOString();
        }

        const update = await db
          .from('schools')
          .update({
            subscription_status:
              decision === 'approved' ? 'active' : 'suspended',
            starts_at:
              decision === 'approved' ? now.toISOString() : null,
            expires_at: expiresAt,
            approved_at:
              decision === 'approved' ? now.toISOString() : null,
          })
          .eq('id', school.id);

        if (update.error) {
          return bad(res, 400, update.error.message);
        }
      }

      const updated = await db
        .from('approval_requests')
        .update({
          status: decision,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', request.id);

      if (updated.error) {
        return bad(res, 400, updated.error.message);
      }

      return res.json({ ok: true });
    }

    // ADD USER WITHOUT SENDING INVITATION
    if (action === 'addUser') {
      const email = String(b.email || '').trim().toLowerCase();
      const fullName = String(b.full_name || '').trim();
      const role = String(b.role || 'school_admin');

      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        !fullName ||
        !['school_admin', 'teacher', 'staff'].includes(role)
      ) {
        return bad(res, 400, 'Invalid user details');
      }

      const { data: school } = await db
        .from('schools')
        .select('id')
        .eq('id', b.school_id)
        .maybeSingle();

      if (!school) {
        return bad(res, 404, 'School not found');
      }

      const { data, error } = await db
        .from('pending_invitations')
        .insert({
          school_id: b.school_id,
          email,
          full_name: fullName,
          role,
          status: 'draft',
        })
        .select()
        .single();

      if (error) {
        return bad(res, 400, error.message);
      }

      return res.json({
        user: data,
        message: 'User saved. Invitation not sent yet.',
      });
    }

    // SEND INVITATION TO EXISTING USER
    if (action === 'invite') {
      const { data: invitation } = await db
        .from('pending_invitations')
        .select('*')
        .eq('id', b.id)
        .eq('status', 'draft')
        .maybeSingle();

      if (!invitation) {
        return bad(res, 404, 'Draft invitation not found');
      }

      const { data: school } = await db
        .from('schools')
        .select('subscription_status,expires_at')
        .eq('id', invitation.school_id)
        .single();

      if (
        !school ||
        school.subscription_status !== 'active' ||
        (
          school.expires_at &&
          new Date(school.expires_at) <= new Date()
        )
      ) {
        return bad(res, 400, 'School license must be active');
      }

      const { data: invited, error: inviteError } =
        await db.auth.admin.inviteUserByEmail(
          invitation.email,
          {
            data: {
              full_name: invitation.full_name,
            },
            redirectTo: 'https://northstars.vercel.app/',
          }
        );

      if (inviteError) {
        return bad(res, 400, inviteError.message);
      }

      if (!invited.user) {
        return bad(res, 500, 'Invitation could not be created');
      }

      const profileUpdate = await db
        .from('profiles')
        .upsert(
          {
            id: invited.user.id,
            email: invitation.email,
            full_name: invitation.full_name,
            role: invitation.role,
            school_id: invitation.school_id,
            approved: false,
          },
          { onConflict: 'id' }
        );

      if (profileUpdate.error) {
        return bad(res, 400, profileUpdate.error.message);
      }

      const invitationUpdate = await db
        .from('pending_invitations')
        .update({
          status: 'invited',
          auth_user_id: invited.user.id,
          invited_at: new Date().toISOString(),
        })
        .eq('id', invitation.id);

      if (invitationUpdate.error) {
        return bad(res, 400, invitationUpdate.error.message);
      }

      return res.json({
        ok: true,
        message: 'Invitation sent successfully',
      });
    }

    return bad(res, 404, 'Unknown action');
  } catch (e: any) {
    return bad(res, 500, e.message || 'Server error');
  }
}
