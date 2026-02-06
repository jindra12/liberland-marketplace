import { User } from '@/payload-types';
import type { Access } from 'payload'

export const onlyOwnDocsOrAdmin: Access = ({ req }) => {
    return onlyOwnDocsOrAdminFilter({ user: req.user });
};

export const onlyOwnDocsOrAdminFilter = ({ user }: { user?: Partial<User> | null }) => {
    if (!user) {
        return false;
    }

    if (user.isAdmin) {
        return true;
    }

    return {
        createdBy: { equals: user.id },
    };
};