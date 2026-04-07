function overlaps(existingFrom, existingTo, newFrom, newTo) {
  // existingFrom < newTo AND existingTo > newFrom
  return existingFrom < newTo && existingTo > newFrom;
}

module.exports = { overlaps };

