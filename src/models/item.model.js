class Item {
  constructor({ id, ownerId, title, description, price }) {
    this.id = id;
    this.ownerId = ownerId;
    this.title = title;
    this.description = description;
    this.price = price;
  }
}

module.exports = { Item };

