import { PrismaClient } from '@prisma/client';

export const db = new PrismaClient();

export const UserRepo = {
  async getById(id: string) {
    return db.user.findUnique({ where: { id } });
  },
  async updateProfile(id: string, data: Partial<any>) {
    return db.user.update({
      where: { id },
      data,
    });
  },
  async getWorkspaceMembers(workspaceId: string) {
    return db.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: true },
    });
  },
};
