const { randomUUID } = require("crypto");

const db = {
  users: [],
  items: [
    {
      id: randomUUID(),
      ownerId: "owner-1",
      title: "Домик у озера",
      description: "Уютный домик на выходные",
      price: 5000,
      isHidden: false,
    },
    {
      id: randomUUID(),
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

