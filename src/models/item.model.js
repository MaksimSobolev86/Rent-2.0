class Item {
  constructor({
    id,
    ownerId,
    name,
    description,
    status,
    photoUrl,
    videoUrl,
    isForSale,
    isForRent,
    salePrice,
    weekdayPriceHour,
    weekdayPriceWeek,
    weekdayPriceMonth,
    weekendPriceHour,
    weekendPriceWeek,
    weekendPriceMonth,
    holidayPriceHour,
    holidayPriceWeek,
    holidayPriceMonth,
    price,
    pricePerHour,
    pricePerWeek,
    pricePerMonth,
    createdAt,
    updatedAt,
  }) {
    this.id = id;
    this.ownerId = ownerId;
    this.name = name;
    this.description = description;
    this.status = status;
    this.photoUrl = photoUrl;
    this.videoUrl = videoUrl;
    this.isForSale = isForSale;
    this.isForRent = isForRent;
    this.salePrice = salePrice;
    this.weekdayPriceHour = weekdayPriceHour;
    this.weekdayPriceWeek = weekdayPriceWeek;
    this.weekdayPriceMonth = weekdayPriceMonth;
    this.weekendPriceHour = weekendPriceHour;
    this.weekendPriceWeek = weekendPriceWeek;
    this.weekendPriceMonth = weekendPriceMonth;
    this.holidayPriceHour = holidayPriceHour;
    this.holidayPriceWeek = holidayPriceWeek;
    this.holidayPriceMonth = holidayPriceMonth;
    this.price = price;
    this.pricePerHour = pricePerHour;
    this.pricePerWeek = pricePerWeek;
    this.pricePerMonth = pricePerMonth;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}

module.exports = { Item };

