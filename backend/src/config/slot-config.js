const DEFAULT_SLOT_COUNT = 50;
const DEFAULT_SLOT_CAPACITY = 20;

function defaultSlotCodes() {
  return Array.from({ length: DEFAULT_SLOT_COUNT }, (_, index) => `A${String(index + 1).padStart(2, "0")}`);
}

module.exports = { DEFAULT_SLOT_COUNT, DEFAULT_SLOT_CAPACITY, defaultSlotCodes };
