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
      name: "Домик у озера",
      description: "Уютный домик на выходные",
      status: "available",
      photoUrl: null,
      videoUrl: null,
      price: 5000,
      pricePerHour: 700,
      pricePerWeek: 20000,
      pricePerMonth: 60000,
    },
    {
      id: item2Id,
      ownerId: "owner-2",
      name: "Беседка в лесу",
      description: "Мангал, стол, электричество",
      status: "busy",
      photoUrl: null,
      videoUrl: null,
      price: 1500,
      pricePerHour: 300,
      pricePerWeek: 7000,
      pricePerMonth: 20000,
    },
  ],
  bookings: [],
};

module.exports = { db };