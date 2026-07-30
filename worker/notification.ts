import prisma from '../src/lib/prisma';

export async function processNotification(data: {
  tenantId: string;
  userIds: string[];
  cardId?: string;
  notifType: string;
  title: string;
  body?: string;
}) {
  const { tenantId, userIds, cardId, notifType, title, body } = data;

  for (const userId of userIds) {
    await prisma.notification.create({
      data: {
        type: notifType,
        title,
        body: body || title,
        userId,
        cardId: cardId || null,
        tenantId,
      },
    });
  }
}
