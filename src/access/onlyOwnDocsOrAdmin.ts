import type { Access } from 'payload'

export const onlyOwnDocsOrAdmin: Access = ({ req }) => {
    const user = req.user
    if (!user) {
        return false;
    }

    if (user.isAdmin) {
        return true;
    }

    return {
        createdBy: { equals: user.id },
    };
}