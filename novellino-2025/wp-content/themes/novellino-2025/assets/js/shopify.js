window.ShopifyBuyManager = (function () {
  const CHECKOUT_STORAGE_KEY = "nv_checkout_id";

  let client = null;
  let readyPromise = null;
  let checkout = null;
  let variants = {};
  let isMutating = false;
  let lineQuantityDebounce = null;

  const SHOPIFY_DOMAIN = "81zwvz-ki.myshopify.com";
  const STOREFRONT_TOKEN = "fa72c12ec4f08ee0236fe9619fffd150";
  const STOREFRONT_API_VERSION = "2024-04";
  // Show the "X stocks left" hint on the product page only at/under this count.
  const LOW_STOCK_THRESHOLD = 10;

  // Cache of variant gid -> quantityAvailable (number, or null when inventory
  // is untracked / unknown). Populated lazily by ensureVariantStock().
  let variantStock = {};

  // ---------------------------------------------------------------------------
  // Init / checkout lifecycle
  // ---------------------------------------------------------------------------

  function initClient() {
    client = ShopifyBuy.buildClient({
      domain: SHOPIFY_DOMAIN,
      storefrontAccessToken: STOREFRONT_TOKEN,
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

  // Wrapper for any mutation to the checkout (adding, removing, changing items) that
  // sets a shared "is mutating" flag to prevent concurrent modifications, and a
  // "drawer busy" state to disable interactions and show a loading state in the
  // cart drawer while the mutation is in-flight. Also centralizes error handling
  // and re-rendering after mutations.
  async function mutate(fn) {
    if (isMutating) return false;
    isMutating = true;
    setDrawerBusy(true);

    try {
      checkout = await fn();
      renderCart();
      return true;
    } catch (error) {
      NotificationService.showNotification(
        NotificationService.TYPE.GENERIC_ERROR,
      );
      console.error(error);
      return false;
    } finally {
      isMutating = false;
      setDrawerBusy(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  // Cart line / variant ids may carry a "?cart=..." suffix; strip it to get
  // the canonical gid used for inventory lookups and caching.
  function canonicalVariantId(id) {
    return typeof id === "string" ? id.split("?")[0] : id;
  }

  // Look up quantityAvailable for any variant gids not already cached, via the
  // Storefront API (needs the unauthenticated_read_product_inventory scope).
  // Returns true when the cache gained new entries (so the caller can re-render).
  async function ensureVariantStock(variantIds) {
    const missing = [
      ...new Set(
        variantIds
          .map(canonicalVariantId)
          .filter((id) => id && !(id in variantStock)),
      ),
    ];
    if (!missing.length) return false;

    try {
      // GraphQL query to fetch stock for multiple variants by gid. We also pull
      // availableForSale so we can tell apart "really out of stock" from
      // "inventory not tracked" — both report quantityAvailable 0, but the
      // latter is still availableForSale and should be treated as unlimited.
      const query = `{ nodes(ids: ${JSON.stringify(missing)}) { ... on ProductVariant { id quantityAvailable availableForSale } } }`;
      const response = await fetch(
        `https://${SHOPIFY_DOMAIN}/api/${STOREFRONT_API_VERSION}/graphql.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Storefront-Access-Token": STOREFRONT_TOKEN,
          },
          body: JSON.stringify({ query }),
        },
      );
      const json = await response.json();
      (json?.data?.nodes || []).forEach((node) => {
        if (!node || !node.id) return;
        // A variant that is sellable but reports 0 available has untracked /
        // oversellable inventory on Shopify. Cache it as null (unlimited) so we
        // don't cap the quantity or show a misleading "0 left in stock".
        const untracked = node.availableForSale && !node.quantityAvailable;
        variantStock[node.id] = untracked ? null : node.quantityAvailable;
      });
    } catch (error) {
      console.error(error);
    }

    // Record anything still unresolved as null so we don't refetch it in a loop.
    missing.forEach((id) => {
      if (!(id in variantStock)) variantStock[id] = null;
    });
    return true;
  }

  function quantityStepperHTML(lineId, quantity, available) {
    const atMax = available != null && quantity >= available;
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

  <input
    class="min-w-9 w-9 px-2 text-center text-[#112D4E] font-extrabold no-scrollbar min-w-0 bg-transparent outline-none"
    type="number"
    step="1"
    min="1"
    value="${quantity}"
    data-line-id="${lineId}"
    oninput="ShopifyBuyManager.onLineQuantityInput(event, '${lineId}')"
    onchange="ShopifyBuyManager.commitLineQuantity(event, '${lineId}')"
    onblur="ShopifyBuyManager.commitLineQuantity(event, '${lineId}')"
    aria-label="Quantity"
  />

  <button
    class="bg-[#F2F4F6] flex items-center justify-center ${atMax ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}"
    onclick="ShopifyBuyManager.changeLineQuantity('${lineId}', 1)"
    aria-label="Increase quantity"
    ${atMax ? "disabled" : ""}
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

    const available = variantStock[canonicalVariantId(item.variant?.id)];
    const atMax = available != null && item.quantity >= available;

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
      <div class="flex flex-col items-end gap-y-1">
        ${quantityStepperHTML(item.id, item.quantity, available)}
        ${atMax ? `<p class="text-yellow-primary text-sm whitespace-nowrap">Only ${available} left in stock</p>` : ""}
      </div>
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

      // Lazily load each line's available stock, then re-render once so the
      // "+" button and "Only X in stock" note reflect inventory. Already-cached
      // variants return false, so this does not loop.
      ensureVariantStock(items.map((item) => item.variant?.id)).then(
        (updated) => {
          if (updated) renderCart();
        },
      );
    } else {
      if (itemsEl) {
        itemsEl.innerHTML = "";
        itemsEl.classList.add("hidden");
      }
      if (emptyEl) emptyEl.classList.remove("hidden");
      if (checkoutButton) checkoutButton.disabled = true;
    }

    // Keep any product cards on the page in sync with the new cart contents.
    refreshProductStockUI();
  }

  // ---------------------------------------------------------------------------
  // Product page: variant loading / price + stock display
  // ---------------------------------------------------------------------------

  // Total quantity of a given variant already sitting in the cart.
  function cartQuantityForVariant(variantId) {
    const canonical = canonicalVariantId(variantId);
    return (checkout?.lineItems || [])
      .filter((li) => canonicalVariantId(li.variant?.id) === canonical)
      .reduce((total, li) => total + li.quantity, 0);
  }

  // Enable/disable all of a product's purchase controls (quantity stepper,
  // add-to-cart, buy-now) for the given wine selector.
  function setPurchaseDisabled(wineSelector, disabled) {
    const quantityContainer = document.querySelector(
      `.quantity-input-container${wineSelector}`,
    );
    if (quantityContainer != null) {
      quantityContainer.classList.toggle("opacity-50", disabled);
      quantityContainer.querySelectorAll("input, button").forEach((el) => {
        el.disabled = disabled;
      });
    }

    [
      `.add-to-cart-button${wineSelector}`,
      `.buy-now-button${wineSelector}`,
    ].forEach((selector) => {
      const button = document.querySelector(selector);
      if (button == null) return;
      button.disabled = disabled;
      button.querySelectorAll("button").forEach((b) => (b.disabled = disabled));
    });
  }

  // Cap a product page's quantity input at the stock still available *after*
  // accounting for what the cart already holds, and disable purchasing entirely
  // once nothing more can be added. Variants with null stock (untracked /
  // unknown) are left uncapped.
  function applyProductStockLimits(wineSelector, variantId) {
    const remaining = variantStock[canonicalVariantId(variantId)];
    if (remaining == null) return;

    const selectable = Math.max(
      0,
      remaining - cartQuantityForVariant(variantId),
    );

    const qtyInput = document.querySelector(
      `.quantity-input-container${wineSelector} input[name="quantity"]`,
    );
    if (qtyInput != null) {
      qtyInput.max = selectable;
      if (parseInt(qtyInput.value, 10) > selectable) {
        qtyInput.value = selectable > 0 ? selectable : 1;
      }
    }

    setPurchaseDisabled(wineSelector, selectable <= 0);

    // Low-stock hint. There are two copies of the element — a mobile one
    // ("Only X left in stock") and a desktop one ("X stock(s) left") — so set
    // each accordingly. Clear the text (rather than toggling a class, which the
    // important display utilities would fight) when there's nothing to show.
    const show = selectable > 0 && selectable <= LOW_STOCK_THRESHOLD;
    document
      .querySelectorAll(`.stocks-left-text${wineSelector}`)
      .forEach((node) => {
        if (!show) {
          node.textContent = "";
          return;
        }
        node.textContent = node.classList.contains("stocks-left-text-mobile")
          ? `Only ${selectable} left in stock`
          : `${selectable} ${selectable === 1 ? "stock" : "stocks"} left`;
        node.classList.remove("hidden");
      });
  }

  // Re-sync every loaded product card on the page with the current cart, so the
  // quantity caps and disabled states stay correct after cart changes (add from
  // the page, remove or edit in the drawer). Skips cards mid-add (their controls
  // are intentionally disabled) and out-of-stock cards (no cached stock).
  function refreshProductStockUI() {
    const seen = new Set();
    document
      .querySelectorAll(
        ".add-to-cart-button[data-wine][data-product-id], .buy-now-button[data-wine][data-product-id]",
      )
      .forEach((node) => {
        const variant = variants[node.dataset.productId];
        if (!variant || seen.has(node.dataset.wine)) return;
        if (node.dataset.adding) return;
        seen.add(node.dataset.wine);
        applyProductStockLimits(
          `[data-wine="${node.dataset.wine}"]`,
          variant.id,
        );
      });
  }

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
          const wineSelector = `[data-wine="${node.dataset.wine}"]`;

          if (!available) {
            const outOfStockText = document.querySelectorAll(
              `.out-of-stock-text${wineSelector}`,
            );
            if (outOfStockText.length > 0) {
              outOfStockText.forEach((node) => {
                node.classList.remove("hidden");
                node.classList.remove("lg:hidden");
              });
            }

            document
              .querySelectorAll(`.stocks-left-text${wineSelector}`)
              .forEach((node) => {
                node.classList.add("hidden");
              });

            const addToCartButton = document.querySelector(
              `.add-to-cart-button${wineSelector}`,
            );
            if (addToCartButton != null) {
              if (addToCartButton.classList.contains("hide-when-unavailable")) {
                addToCartButton.classList.add("hidden");
              } else {
                addToCartButton
                  .querySelectorAll("button")
                  .forEach((button) => (button.disabled = true));
                addToCartButton.disabled = true;
              }
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
              const qtyInput = quantityContainer.querySelector(
                `input[name="quantity"]`,
              );
              if (qtyInput != null) qtyInput.value = "0";
            }
          } else {
            // In stock: cap the quantity input at the stock still available
            // after what the cart already holds, and show a low-stock hint when
            // only a few remain.
            await ensureVariantStock([variant.id]);
            applyProductStockLimits(wineSelector, variant.id);
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

      // The cart just grew, so re-cap this card (and disable it if the cart now
      // holds all available stock).
      applyProductStockLimits(wineSelector, variant.id);
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

  function findLine(lineId) {
    return (checkout?.lineItems || []).find((li) => li.id === lineId);
  }

  // Shared logic for both the +/- buttons and the editable input. Parses the
  // requested quantity, treats empty/<=0 as a removal (matching the default
  // Shopify cart UX), and routes everything through the same mutate pipeline.
  async function setLineQuantity(lineId, rawValue) {
    const item = findLine(lineId);
    if (!item) return;

    const parsed = parseInt(rawValue, 10);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      removeLine(lineId);
      return;
    }

    if (parsed === item.quantity) {
      renderCart(); // revert any stray typed text back to the canonical value
      return;
    }

    const ok = await mutate(() =>
      client.checkout.updateLineItems(checkout.id, [
        { id: lineId, quantity: parsed },
      ]),
    );
    if (!ok) return;

    // Shopify clamps the line to the available stock and returns the applied
    // quantity. If it came back lower than requested, the user exceeded stock,
    // so the applied quantity is the maximum — surface it.
    const updated = findLine(lineId);
    if (updated && updated.quantity < parsed) {
      NotificationService.showNotification(NotificationService.TYPE.TEXT, {
        text: `Only ${updated.quantity} in stock. The maximum quantity is ${updated.quantity}.`,
      });
    }
  }

  function changeLineQuantity(lineId, delta) {
    const item = findLine(lineId);
    if (!item) return;
    // Pass the raw target quantity; setLineQuantity removes the line when it
    // drops to 0, so clicking "-" at quantity 1 removes the item.
    setLineQuantity(lineId, item.quantity + delta);
  }

  // Debounced commit while the user is typing in the quantity input, so a run
  // of keystrokes results in a single Shopify update rather than one per key.
  function onLineQuantityInput(event, lineId) {
    const value = event.target.value;
    if (lineQuantityDebounce) clearTimeout(lineQuantityDebounce);
    lineQuantityDebounce = setTimeout(() => {
      lineQuantityDebounce = null;
      setLineQuantity(lineId, value);
    }, 600);
  }

  // Immediate commit on blur / Enter (change). Cancels any pending debounce so
  // we never fire the same update twice.
  function commitLineQuantity(event, lineId) {
    if (lineQuantityDebounce) {
      clearTimeout(lineQuantityDebounce);
      lineQuantityDebounce = null;
    }
    setLineQuantity(lineId, event.target.value);
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
      setNotificationsCentered(true);
    });
  }

  function closeCart() {
    const drawer = document.querySelector(".cart-drawer");
    const backdrop = document.querySelector(".cart-drawer-backdrop");

    if (drawer) drawer.classList.add("translate-x-full");
    if (backdrop) backdrop.classList.add("opacity-0", "pointer-events-none");
    document.body.classList.remove("overflow-hidden");
    setNotificationsCentered(false);
  }

  // The shared notification container sits top-right by default. While the cart
  // drawer is open, center it (desktop) so cart notifications don't overlap the
  // drawer; other pages/notifications keep the default position. The positioning
  // lives in global.css (.notification-container.is-centered).
  function setNotificationsCentered(centered) {
    const notif = document.querySelector(".notification-container");
    if (!notif) return;
    notif.classList.toggle("is-centered", centered);
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
    onLineQuantityInput,
    commitLineQuantity,
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

        if (!node.hasAttribute("onclick")) {
          node.addEventListener("click", async (event) => {
            window.ShopifyBuyManager.onAddToCartClick(event.currentTarget);
          });
        }
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
