import { db } from './user.repo';

export const BoardRepo = {
  async getBoard(id: string) {
    return db.board.findUnique({
      where: { id },
      include: {
        lists: {
          orderBy: { rank: 'asc' },
          include: {
            cards: {
              orderBy: { rank: 'asc' },
              include: {
                labels: { include: { label: true } },
                members: { include: { user: true } },
              },
            },
          },
        },
      },
    });
  },
  async createBoard(data: { name: string, workspaceId: string, background: any }) {
    return db.board.create({
      data: {
        name: data.name,
        workspaceId: data.workspaceId,
        background: data.background,
      },
    });
  },
  async moveCard(cardId: string, newListId: string, newRank: string) {
    return db.card.update({
      where: { id: cardId },
      data: {
        listId: newListId,
        rank: newRank,
      },
    });
  },
};
