class User {
  constructor({ id, role, name, phone }) {
    this.id = id;
    this.role = role;
    this.name = name;
    this.phone = phone;
  }
}

module.exports = { User };

