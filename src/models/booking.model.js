class Booking {
  constructor({ id, itemId, clientId, dateFrom, dateTo, status }) {
    this.id = id;
    this.itemId = itemId;
    this.clientId = clientId;
    this.dateFrom = dateFrom;
    this.dateTo = dateTo;
    this.status = status;
  }
}

module.exports = { Booking };

