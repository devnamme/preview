window.ShopifyBuyManager = (function () {
  const CHECKOUT_STORAGE_KEY = "nv_checkout_id";

  let client = null;
  let readyPromise = null;
  let checkout = null;
  let variants = {};
  let isMutating = false;

  // ---------------------------------------------------------------------------
  // Init / checkout lifecycle
  // ---------------------------------------------------------------------------

  function initClient() {
    client = ShopifyBuy.buildClient({
      domain: "81zwvz-ki.myshopify.com",
      storefrontAccessToken: "b0f54e6e38dae272135d36bbeb7b7a24",
    });

    return initCheckout();
  }

  async function initCheckout() {
    const savedId = localStorage.getItem(CHECKOUT_STORAGE_KEY);

    if (savedId) {
      try {
        const existing = await client.checkout.fetch(savedId);
        if (existing && !existing.completedAt) {
          checkout = existing;
        }
      } catch (error) {
        // Stale / invalid checkout id — fall through and create a new one.
      }
    }

    if (!checkout) {
      checkout = await client.checkout.create();
      localStorage.setItem(CHECKOUT_STORAGE_KEY, checkout.id);
    }

    renderCart();
    return checkout;
  }

  function ensureReady() {
    if (!readyPromise) {
      readyPromise = initClient().catch((error) => {
        readyPromise = null;
        throw error;
      });
    }
    return readyPromise;
  }

  function init() {
    ensureReady().catch((error) => {
      NotificationService.showNotification(
        NotificationService.TYPE.GENERIC_ERROR,
      );
      console.error(error);
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function formatPrice(amount, currencyCode) {
    const num = Number(amount);
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: currencyCode || "PHP",
      minimumFractionDigits: Number.isInteger(num) ? 0 : 2,
    }).format(num);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char],
    );
  }

  function setDrawerBusy(busy) {
    const items = document.querySelector(".cart-drawer-items");
    if (!items) return;
    items.classList.toggle("opacity-50", busy);
    items.classList.toggle("pointer-events-none", busy);
  }

  async function mutate(fn) {
    if (isMutating) return;
    isMutating = true;
    setDrawerBusy(true);

    try {
      checkout = await fn();
      renderCart();
    } catch (error) {
      NotificationService.showNotification(
        NotificationService.TYPE.GENERIC_ERROR,
      );
      console.error(error);
    } finally {
      isMutating = false;
      setDrawerBusy(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  function quantityStepperHTML(lineId, quantity) {
    return `
<div class="border border-[#CFD8DC] rounded-xl overflow-clip min-h-9 grid grid-cols-[36px_auto_36px] items-stretch">
  <button
    class="bg-[#F2F4F6] flex items-center justify-center cursor-pointer"
    onclick="ShopifyBuyManager.changeLineQuantity('${lineId}', -1)"
    aria-label="Decrease quantity"
  >
    <svg class="text-[#37474F] size-3.5" xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" viewBox="0 0 256 256">
      <path d="M224,128a8,8,0,0,1-8,8H40a8,8,0,0,1,0-16H216A8,8,0,0,1,224,128Z" />
    </svg>
  </button>

  <div class="min-w-9 px-2 flex items-center justify-center text-center text-[#112D4E] font-extrabold">${quantity}</div>

  <button
    class="bg-[#F2F4F6] flex items-center justify-center cursor-pointer"
    onclick="ShopifyBuyManager.changeLineQuantity('${lineId}', 1)"
    aria-label="Increase quantity"
  >
    <svg class="text-[#37474F] size-3.5" xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" viewBox="0 0 256 256">
      <path d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z" />
    </svg>
  </button>
</div>`;
  }

  function lineItemHTML(item) {
    const variantTitle =
      item.variant?.title && item.variant.title !== "Default Title"
        ? item.variant.title
        : "";
    const price = formatPrice(
      item.variant?.priceV2?.amount,
      item.variant?.priceV2?.currencyCode,
    );
    const imageSrc = item.variant?.image?.src || "";

    return `
<div class="flex flex-row gap-x-4 py-6 not-last:border-b border-[#EFF0F6]" data-line-id="${item.id}">
  <div class="shrink-0 size-22 rounded-xl bg-red-custom-light p-2.5 flex items-center justify-center">
    <img class="size-full object-contain object-center" src="${escapeHtml(imageSrc)}" alt="${escapeHtml(item.title)}" />
  </div>

  <div class="grow flex flex-row justify-between gap-x-3">
    <div class="flex flex-col items-start">
      <p class="text-lg font-extrabold text-red-secondary">${escapeHtml(item.title)}</p>
      ${variantTitle ? `<p class="text-[#90A4AE]">${escapeHtml(variantTitle)}</p>` : ""}
      <button
        class="mt-auto text-red-light font-medium underline cursor-pointer"
        onclick="ShopifyBuyManager.removeLine('${item.id}')"
      >Remove</button>
    </div>

    <div class="shrink-0 flex flex-col items-end justify-between gap-y-3">
      <p class="text-lg font-extrabold text-red-primary whitespace-nowrap">${price}</p>
      ${quantityStepperHTML(item.id, item.quantity)}
    </div>
  </div>
</div>`;
  }

  function renderCart() {
    const items = checkout?.lineItems || [];
    const count = items.reduce((total, item) => total + item.quantity, 0);

    updateCartCount(count);

    const countEl = document.querySelector(".cart-drawer-count");
    if (countEl) {
      countEl.textContent = count > 0 ? `(${count})` : "";
    }

    const currencyCode = items[0]?.variant?.priceV2?.currencyCode || "PHP";
    const subtotal = items.reduce(
      (total, item) =>
        total + Number(item.variant?.priceV2?.amount || 0) * item.quantity,
      0,
    );

    const subtotalEl = document.querySelector(".cart-drawer-subtotal");
    if (subtotalEl) {
      subtotalEl.textContent = formatPrice(subtotal, currencyCode);
    }

    const itemsEl = document.querySelector(".cart-drawer-items");
    const emptyEl = document.querySelector(".cart-drawer-empty");
    const checkoutButton = document.querySelector(".cart-checkout-button");

    if (items.length > 0) {
      if (itemsEl) {
        itemsEl.innerHTML = items.map(lineItemHTML).join("");
        itemsEl.classList.remove("hidden");
      }
      if (emptyEl) emptyEl.classList.add("hidden");
      if (checkoutButton) checkoutButton.disabled = false;
    } else {
      if (itemsEl) {
        itemsEl.innerHTML = "";
        itemsEl.classList.add("hidden");
      }
      if (emptyEl) emptyEl.classList.remove("hidden");
      if (checkoutButton) checkoutButton.disabled = true;
    }
  }

  // ---------------------------------------------------------------------------
  // Product page: variant loading / price + stock display
  // ---------------------------------------------------------------------------

  function loadVariant(node) {
    ensureReady()
      .then(async function () {
        try {
          const variant = (
            await client.product.fetch(
              `gid://shopify/Product/${node.dataset.productId}`,
            )
          ).variants[0];

          const available = variant.available;

          if (!available) {
            const wineSelector = `[data-wine="${node.dataset.wine}"]`;

            const outOfStockText = document.querySelector(
              `.out-of-stock-text${wineSelector}`,
            );
            if (outOfStockText != null) {
              outOfStockText.classList.remove("hidden");
            }

            const addToCartButton = document.querySelector(
              `.add-to-cart-button${wineSelector}`,
            );
            if (addToCartButton != null) {
              addToCartButton
                .querySelectorAll("button")
                .forEach((button) => (button.disabled = true));
              addToCartButton.disabled = true;
            }

            const buyNowButton = document.querySelector(
              `.buy-now-button${wineSelector}`,
            );
            if (buyNowButton != null) {
              buyNowButton
                .querySelectorAll("button")
                .forEach((button) => (button.disabled = true));
              buyNowButton.disabled = true;
            }

            const quantityContainer = document.querySelector(
              `.quantity-input-container${wineSelector}`,
            );
            if (quantityContainer != null) {
              quantityContainer.classList.add("opacity-50");
              quantityContainer
                .querySelectorAll(`input, button`)
                .forEach((node) => {
                  node.disabled = true;
                });
            }
          }

          const priceText = document.querySelector(
            `.price-text[data-wine="${node.dataset.wine}"]`,
          );
          if (priceText != null) {
            const { amount, currencyCode } = variant.priceV2;
            priceText.textContent = formatPrice(amount, currencyCode);
            priceText.classList.remove("hidden");
          }

          variants[node.dataset.productId] = variant;
        } catch (error) {
          NotificationService.showNotification(
            NotificationService.TYPE.GENERIC_ERROR,
          );
          console.error(error);
        }
      })
      .catch((error) => {
        NotificationService.showNotification(
          NotificationService.TYPE.GENERIC_ERROR,
        );
        console.error(error);
      });
  }

  // ---------------------------------------------------------------------------
  // Cart actions
  // ---------------------------------------------------------------------------

  async function onAddToCartClick(node) {
    const wineSelector = `[data-wine="${node.dataset.wine}"]`;

    try {
      await ensureReady();

      const productId = node.dataset.productId;
      if (!productId) {
        throw "product not found";
      }

      const variant = variants[productId];
      if (!variant) {
        throw "variant not found";
      }

      let quantity = 1;
      const input = document.querySelector(
        `.quantity-input-container${wineSelector} input[name="quantity"]`,
      );
      if (input != null && input.value.trim() !== "") {
        quantity = parseInt(input.value);
      }

      const controls = document.querySelectorAll(
        `.quantity-input-container${wineSelector} button, .quantity-input-container${wineSelector} input, .add-to-cart-button${wineSelector}`,
      );
      controls.forEach((el) => {
        el.dataset.adding = true;
        el.disabled = true;
      });

      try {
        checkout = await client.checkout.addLineItems(checkout.id, [
          { variantId: variant.id, quantity },
        ]);
        renderCart();

        NotificationService.showNotification(
          NotificationService.TYPE.ADDED_TO_CART,
          {
            name: document.querySelector(`.name-text${wineSelector}`)
              ?.innerText,
            quantity,
            price: formatPrice(
              variant.priceV2.amount,
              variant.priceV2.currencyCode,
            ),
            thumbnailUrl: variant?.image?.src,
            premium: (
              document.querySelector(`.thumbnail${wineSelector}`)?.classList ??
              []
            ).contains("premium"),
          },
        );
      } finally {
        controls.forEach((el) => {
          delete el.dataset.adding;
          el.disabled = false;
        });
      }
    } catch (error) {
      NotificationService.showNotification(
        NotificationService.TYPE.GENERIC_ERROR,
      );
      console.error(error);
    }
  }

  async function onBuyNowClick(node) {
    try {
      await ensureReady();

      const productId = node.dataset.productId;
      if (!productId) {
        throw "product not found";
      }

      const variant = variants[productId];
      if (!variant) {
        throw "variant not found";
      }

      const newCheckout = await client.checkout.create();
      const updatedCheckout = await client.checkout.addLineItems(
        newCheckout.id,
        [{ variantId: variant.id, quantity: 1 }],
      );

      window.open(updatedCheckout.webUrl);
    } catch (error) {
      NotificationService.showNotification(
        NotificationService.TYPE.GENERIC_ERROR,
      );
      console.error(error);
    }
  }

  function changeLineQuantity(lineId, delta) {
    const item = (checkout?.lineItems || []).find((li) => li.id === lineId);
    if (!item) return;

    const nextQuantity = Math.max(1, item.quantity + delta);
    if (nextQuantity === item.quantity) return;

    mutate(() =>
      client.checkout.updateLineItems(checkout.id, [
        { id: lineId, quantity: nextQuantity },
      ]),
    );
  }

  function removeLine(lineId) {
    mutate(() => client.checkout.removeLineItems(checkout.id, [lineId]));
  }

  function proceedToCheckout() {
    if (checkout?.webUrl) {
      window.location.href = checkout.webUrl;
    }
  }

  // ---------------------------------------------------------------------------
  // Drawer open / close
  // ---------------------------------------------------------------------------

  function openCart() {
    ensureReady().finally(() => {
      const drawer = document.querySelector(".cart-drawer");
      const backdrop = document.querySelector(".cart-drawer-backdrop");

      if (drawer) drawer.classList.remove("translate-x-full");
      if (backdrop) {
        backdrop.classList.remove("opacity-0", "pointer-events-none");
      }
      document.body.classList.add("overflow-hidden");
    });
  }

  function closeCart() {
    const drawer = document.querySelector(".cart-drawer");
    const backdrop = document.querySelector(".cart-drawer-backdrop");

    if (drawer) drawer.classList.add("translate-x-full");
    if (backdrop) backdrop.classList.add("opacity-0", "pointer-events-none");
    document.body.classList.remove("overflow-hidden");
  }

  function updateCartCount(count) {
    try {
      const cartContainer = document.querySelector(".cart-container");
      if (!cartContainer) {
        throw "cart container not found";
      }

      const countContainer = cartContainer.querySelector(
        ".cart-count-container",
      );
      if (!countContainer) {
        throw "cart count container not found";
      }

      const countText = cartContainer.querySelector(".cart-count-text");
      if (!countText) {
        throw "count text not found";
      }

      if (count > 0) {
        countContainer.classList.remove("hidden");
      } else {
        countContainer.classList.add("hidden");
      }

      countText.innerText = count;
    } catch (error) {
      console.error(error);
    }
  }

  return {
    init,
    loadVariant,
    onAddToCartClick,
    onBuyNowClick,
    changeLineQuantity,
    removeLine,
    proceedToCheckout,
    openCart,
    closeCart,
  };
})();

document.addEventListener("DOMContentLoaded", () => {
  document
    .querySelectorAll(".add-to-cart-button[data-wine][data-product-id]")
    .forEach((node) => {
      try {
        window.ShopifyBuyManager.loadVariant(node);

        node.addEventListener("click", async (event) => {
          window.ShopifyBuyManager.onAddToCartClick(event.currentTarget);
        });
      } catch (error) {
        NotificationService.showNotification(
          NotificationService.TYPE.GENERIC_ERROR,
        );
        console.error(error);
      }
    });

  document
    .querySelectorAll(".buy-now-button[data-wine][data-product-id]")
    .forEach((node) => {
      window.ShopifyBuyManager.loadVariant(node);
      node.addEventListener("click", (event) => {
        window.ShopifyBuyManager.onBuyNowClick(event.currentTarget);
      });
    });
});
