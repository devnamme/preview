// Clamp a quantity to the input's [1, max] range. max is set from the variant's
// available stock in shopify.js loadVariant(); when unset, only the lower bound
// applies.
function clampToStock(input, value) {
  if (isNaN(value) || value < 1) {
    value = 1;
  }

  const max = parseInt(input.max, 10);
  if (!isNaN(max) && value > max) {
    value = max;
  }

  return value;
}

function onQuantityIncrementClick(event, delta) {
  const input = event.target
    .closest(".quantity-input-container")
    .querySelector("input[name='quantity']");

  if (input.value === "") {
    input.value = 1;
  } else {
    input.value = clampToStock(input, parseInt(input.value, 10) + delta);
  }
}

// Clamp a manually typed quantity to the available stock.
function onQuantityInputChange(event) {
  const input = event.target;
  input.value = clampToStock(input, parseInt(input.value, 10));
}
