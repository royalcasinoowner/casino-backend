import { Pool } from 'pg';
import { UserRepository, UserDecrypted } from './UserRepository';

export class AdminAccessLayer {
    private userRepository: UserRepository;
    private pool: Pool;

    constructor(pool: Pool) {
        this.pool = pool;
        this.userRepository = new UserRepository(pool);
    }

    /**
     * Secures access to decrypted user records for admins.
     * Logs the access attempt to the audit table.
     */
    public async viewUserProfile(adminUid: string, targetUserId: number, reason: string): Promise<UserDecrypted | null> {
        
        // 1. Fetch decrypted profile via Repository
        const profile = await this.userRepository.getUserById(targetUserId);

        // 2. Audit Log the decryption access
        const accessedFields = profile ? ['email', 'phone', 'kycData'] : [];
        await this.logAudit(adminUid, targetUserId.toString(), `VIEW_PROFILE_DECRYPTED - Reason: ${reason}`, accessedFields);

        // 3. Optional: Add role-based masking here (e.g. if admin is Level 1, mask email to j***@gmail.com)
        // if (adminRole === 'MODERATOR') {
        //    profile.email = maskEmail(profile.email);
        // }

        return profile;
    }

    private async logAudit(adminUid: string, targetUserId: string, action: string, accessedFields: string[]) {
        const query = `
            INSERT INTO admin_audit_logs (admin_uid, action, target_user_id, accessed_fields)
            VALUES ($1, $2, $3, $4)
        `;
        await this.pool.query(query, [adminUid, action, targetUserId, JSON.stringify(accessedFields)]);
    }
}
