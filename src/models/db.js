const { randomUUID } = require("crypto");

const item1Id = randomUUID();
const item2Id = randomUUID();

console.log('ITEM IDS:', { item1Id, item2Id });

const db = {
  users: [],
  items: [
    {
      id: item1Id,
      ownerId: "owner-1",
      title: "Домик у озера",
      description: "Уютный домик на выходные",
      price: 5000,
      isHidden: false,
    },
    {
      id: item2Id,
      ownerId: "owner-2",
      title: "Беседка в лесу",
      description: "Мангал, стол, электричество",
      price: 1500,
      isHidden: false,
    },
  ],
  bookings: [],
};

module.exports = { db };