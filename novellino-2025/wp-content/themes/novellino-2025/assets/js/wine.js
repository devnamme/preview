function onQuantityIncrementClick(event, delta) {
  const input = event.target
    .closest(".quantity-input-container")
    .querySelector("input[name='quantity']");

  let value = input.value;

  if (value === "") {
    input.value = 1;
  } else {
    value = parseInt(value) + delta;
    if (value <= 1) {
      value = 1;
    }

    input.value = value;
  }
}
