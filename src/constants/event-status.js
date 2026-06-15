const EventStatus = Object.freeze({
  Draft: "draft",
  Published: "published",
  Cancelled: "cancelled",
  Completed: "completed",
});

const EVENT_STATUS_VALUES = Object.freeze(Object.values(EventStatus));
const EVENT_STATUS_SET = new Set(EVENT_STATUS_VALUES);

module.exports = {
  EventStatus,
  EVENT_STATUS_VALUES,
  EVENT_STATUS_SET,
};
