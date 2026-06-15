/** Статусы вещи в админке */
const ITEM_STATUS = {
  AVAILABLE: "available",
  BUSY: "busy",
  MAINTENANCE: "maintenance",
  HIDDEN: "hidden",
};

/** Клиентский каталог: только «доступно» (аренда и продажа). */
function isItemAvailableForClients(status) {
  return (status ?? ITEM_STATUS.AVAILABLE) === ITEM_STATUS.AVAILABLE;
}

/** SQL-фрагмент для публичных запросов к items */
function clientCatalogStatusSql(tableAlias = "") {
  const col = tableAlias ? `${tableAlias}.status` : "status";
  return `COALESCE(${col}, 'available') = 'available'`;
}

module.exports = {
  ITEM_STATUS,
  isItemAvailableForClients,
  clientCatalogStatusSql,
};
