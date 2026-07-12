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

// Issue #45: The add-to-cart bar is `position: fixed` at the bottom of the
// screen on mobile. Keep a spacer the same height as the bar so no page content
// hides behind it, and slide the bar out of the way once the CTA / footer comes
// into view so it never overlaps them. (On desktop the bar is inline and the
// `.cart-bar-hidden` styles are scoped away by the media query, so this is a
// harmless no-op there.)
(function () {
  function initCartBar() {
    const bar = document.getElementById("wine-cart-bar");
    const spacer = document.getElementById("wine-cart-bar-spacer");
    if (!bar || !spacer) {
      return;
    }

    const syncSpacerHeight = () => {
      spacer.style.height = bar.offsetHeight + "px";
    };

    // The spacer sits directly above the CTA. Hide the bar once its top edge
    // enters the viewport — i.e. we've reached the end of the product content
    // and the CTA / footer is coming into view — and keep it hidden all the way
    // down. Show it again while the spacer is still below the fold. Using the
    // spacer's live position (rather than an IntersectionObserver) keeps this
    // monotonic and correct even for large jump-scrolls.
    const updateBar = () => {
      const reachedEnd =
        spacer.getBoundingClientRect().top < window.innerHeight;
      bar.classList.toggle("cart-bar-hidden", reachedEnd);
    };

    syncSpacerHeight();
    updateBar();
    window.addEventListener("scroll", updateBar, { passive: true });
    window.addEventListener("resize", () => {
      syncSpacerHeight();
      updateBar();
    });

    // The bar's height changes after Shopify stock data loads (an in-stock
    // product reveals the Add to Cart / Buy Now buttons), so keep the spacer in
    // sync with it rather than measuring only once on load.
    if (typeof ResizeObserver !== "undefined") {
      const barResizeObserver = new ResizeObserver(() => {
        syncSpacerHeight();
        updateBar();
      });
      barResizeObserver.observe(bar);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCartBar);
  } else {
    initCartBar();
  }
})();
