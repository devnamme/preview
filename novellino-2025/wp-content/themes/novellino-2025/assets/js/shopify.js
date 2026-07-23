window.ShopifyBuyManager = (function () {
  const CHECKOUT_STORAGE_KEY = "nv_checkout_id";
  const DOB_STORAGE_KEY = "nv_buyer_dob";

  let client = null;
  let readyPromise = null;
  let checkout = null;
  let variants = {};
  let isMutating = false;
  let lineQuantityDebounce = null;
  // Variant awaiting checkout while the Buy Now DOB modal is open.
  let pendingBuyNowVariant = null;

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

    if (items.length > 0) {
      if (itemsEl) {
        itemsEl.innerHTML = items.map(lineItemHTML).join("");
        itemsEl.classList.remove("hidden");
      }
      if (emptyEl) emptyEl.classList.add("hidden");

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
    }

    // Enable/disable checkout based on cart contents + a valid DOB.
    updateCheckoutButtonState();

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

      // Buy Now skips the cart drawer (and its DOB field), so enforce the DOB
      // here. If we already have a valid one (entered earlier in the drawer or a
      // previous Buy Now, persisted in localStorage), reuse it and go straight
      // to checkout. Otherwise collect it via the modal, which resumes the flow.
      if (validateDob(currentDobValue()).valid) {
        await executeBuyNow(variant);
      } else {
        pendingBuyNowVariant = variant;
        openDobModal();
      }
    } catch (error) {
      NotificationService.showNotification(
        NotificationService.TYPE.GENERIC_ERROR,
      );
      console.error(error);
    }
  }

  // Create a one-off checkout for a single variant, stamp the buyer's DOB + age
  // onto it (fail open — a failed attribute write shouldn't block the sale), and
  // open Shopify's hosted checkout.
  async function executeBuyNow(variant) {
    let newCheckout = await client.checkout.create();
    newCheckout = await client.checkout.addLineItems(newCheckout.id, [
      { variantId: variant.id, quantity: 1 },
    ]);

    const value = currentDobValue();
    const result = validateDob(value);
    if (result.valid) {
      try {
        newCheckout = await client.checkout.updateAttributes(newCheckout.id, {
          customAttributes: [
            { key: "Date of Birth", value },
            { key: "Age", value: String(result.age) },
          ],
        });
      } catch (error) {
        console.error(error);
      }
    }

    window.open(newCheckout.webUrl);
  }

  // ---------------------------------------------------------------------------
  // Buy Now DOB modal
  // ---------------------------------------------------------------------------

  function getDobModalInput() {
    return document.getElementById("dob-modal-input");
  }

  function showDobModalError(message) {
    const el = document.querySelector(".dob-modal-error");
    if (!el) return;
    if (message) {
      el.textContent = message;
      el.classList.remove("hidden");
    } else {
      el.textContent = "";
      el.classList.add("hidden");
    }

    const group = el.closest(".group[data-field-name]");
    if (group) {
      if (message) group.dataset.hasError = "true";
      else delete group.dataset.hasError;
    }
  }

  function openDobModal() {
    const modal = document.querySelector(".dob-modal");
    const backdrop = document.querySelector(".dob-modal-backdrop");
    const input = getDobModalInput();

    if (input) {
      input.max = todayISO();
      input.value = getStoredDob();
    }
    showDobModalError("");

    if (modal) {
      modal.classList.remove("opacity-0", "scale-95", "pointer-events-none");
      modal.classList.add("opacity-100", "scale-100");
    }
    if (backdrop) {
      backdrop.classList.remove("opacity-0", "pointer-events-none");
    }
    document.body.classList.add("overflow-hidden");
    if (input) input.focus();
  }

  function closeDobModal() {
    const modal = document.querySelector(".dob-modal");
    const backdrop = document.querySelector(".dob-modal-backdrop");

    if (modal) {
      modal.classList.add("opacity-0", "scale-95", "pointer-events-none");
      modal.classList.remove("opacity-100", "scale-100");
    }
    if (backdrop) {
      backdrop.classList.add("opacity-0", "pointer-events-none");
    }
    // Only release the scroll lock if the cart drawer isn't also holding it.
    const drawerOpen = document
      .querySelector(".cart-drawer")
      ?.classList.contains("translate-x-full");
    if (drawerOpen !== false) {
      document.body.classList.remove("overflow-hidden");
    }
    pendingBuyNowVariant = null;
  }

  function onDobModalInput(event) {
    const result = validateDob(event.target.value);
    showDobModalError(result.valid ? "" : result.error);
  }

  async function submitDobModal() {
    const input = getDobModalInput();
    const value = input ? input.value : "";
    const result = validateDob(value);

    if (!result.valid) {
      showDobModalError(result.error || "Please enter your date of birth.");
      if (input) input.focus();
      return;
    }

    // Persist and mirror into the drawer field so both checkout paths agree.
    localStorage.setItem(DOB_STORAGE_KEY, value);
    const drawerInput = getDobInput();
    if (drawerInput) drawerInput.value = value;
    showDobError("");
    updateCheckoutButtonState();

    const variant = pendingBuyNowVariant;
    closeDobModal();

    if (variant) {
      try {
        await executeBuyNow(variant);
      } catch (error) {
        NotificationService.showNotification(
          NotificationService.TYPE.GENERIC_ERROR,
        );
        console.error(error);
      }
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

  // ---------------------------------------------------------------------------
  // Buyer date of birth
  //
  // Collected in the cart drawer and attached to the Shopify order as checkout
  // custom attributes (Date of Birth + computed Age), which show up in the admin
  // order detail, order exports, and the Orders API. Required for data capture —
  // the checkout button stays disabled until a valid, complete date is entered.
  // This is not a legal age gate; no minimum age is enforced.
  // ---------------------------------------------------------------------------

  function getDobInput() {
    return document.getElementById("cart-dob-input");
  }

  function getStoredDob() {
    return localStorage.getItem(DOB_STORAGE_KEY) || "";
  }

  // Source of truth: the live input if present, else whatever we persisted.
  function currentDobValue() {
    const input = getDobInput();
    return input ? input.value : getStoredDob();
  }

  function todayISO() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function computeAge(dobString) {
    const dob = new Date(`${dobString}T00:00:00`);
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const monthDelta = now.getMonth() - dob.getMonth();
    if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dob.getDate())) {
      age -= 1;
    }
    return age;
  }

  // A native date input hands us "YYYY-MM-DD" or "". Returns validity, the
  // computed age, and a user-facing error message (empty when the field is
  // simply blank, so we don't nag before they've typed anything).
  function validateDob(dobString) {
    if (!dobString) return { valid: false, age: null, error: "" };

    const dob = new Date(`${dobString}T00:00:00`);
    if (Number.isNaN(dob.getTime())) {
      return { valid: false, age: null, error: "Please enter a valid date." };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (dob > today) {
      return {
        valid: false,
        age: null,
        error: "Date of birth can't be in the future.",
      };
    }

    const age = computeAge(dobString);
    if (age > 120) {
      return {
        valid: false,
        age: null,
        error: "Please enter a valid date of birth.",
      };
    }

    return { valid: true, age, error: "" };
  }

  function showDobError(message) {
    const el = document.querySelector(".cart-dob-error");
    if (!el) return;
    if (message) {
      el.textContent = message;
      el.classList.remove("hidden");
    } else {
      el.textContent = "";
      el.classList.add("hidden");
    }

    // Drive the theme's shared error styling (red border via
    // group-data-has-error) on the field group, matching the contact form.
    const group = el.closest(".group[data-field-name]");
    if (group) {
      if (message) group.dataset.hasError = "true";
      else delete group.dataset.hasError;
    }
  }

  // Enable "Proceed to Checkout" only when the cart has items AND the DOB is
  // valid. Centralizes the button state so renderCart and the DOB input share it.
  function updateCheckoutButtonState() {
    const checkoutButton = document.querySelector(".cart-checkout-button");
    if (!checkoutButton) return;
    const hasItems = (checkout?.lineItems || []).length > 0;
    checkoutButton.disabled = !(
      hasItems && validateDob(currentDobValue()).valid
    );
  }

  function onDobInput(event) {
    const value = event.target.value;
    const result = validateDob(value);

    if (value) {
      localStorage.setItem(DOB_STORAGE_KEY, value);
    } else {
      localStorage.removeItem(DOB_STORAGE_KEY);
    }

    showDobError(result.valid ? "" : result.error);
    updateCheckoutButtonState();
  }

  // Prefill the input from storage on load and cap the picker at today, then
  // sync the checkout button. Safe to call before the SDK is ready.
  function hydrateDob() {
    const input = getDobInput();
    if (!input) return;
    input.max = todayISO();
    const stored = getStoredDob();
    if (stored) input.value = stored;
    updateCheckoutButtonState();
  }

  async function proceedToCheckout() {
    const value = currentDobValue();
    const result = validateDob(value);
    if (!result.valid) {
      showDobError(result.error || "Please enter your date of birth.");
      const input = getDobInput();
      if (input) input.focus();
      updateCheckoutButtonState();
      return;
    }

    // Stamp the DOB + age onto the checkout so they land on the Shopify order.
    // Fail open: if the attribute write errors, log it but still let the sale
    // proceed — this is data capture, not a hard gate.
    try {
      await ensureReady();
      checkout = await client.checkout.updateAttributes(checkout.id, {
        customAttributes: [
          { key: "Date of Birth", value },
          { key: "Age", value: String(result.age) },
        ],
      });
    } catch (error) {
      console.error(error);
    }

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
    onDobInput,
    hydrateDob,
    closeDobModal,
    onDobModalInput,
    submitDobModal,
    openCart,
    closeCart,
  };
})();

document.addEventListener("DOMContentLoaded", () => {
  window.ShopifyBuyManager.hydrateDob();

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
