window.ShopifyBuyManager = (function () {
  let client = null;
  let ui = null;
  let isReady = false;
  let readyQueue = [];

  let cart = null;
  let variantIds = {};

  function initClient() {
    try {
      client = ShopifyBuy.buildClient({
        domain: "81zwvz-ki.myshopify.com",
        storefrontAccessToken: "b0f54e6e38dae272135d36bbeb7b7a24",
      });
    } catch (error) {
      console.error(error);
    }

    return ShopifyBuy.UI.onReady(client).then(function (uiInstance) {
      ui = uiInstance;
      isReady = true;

      readyQueue.forEach((fn) => fn());
      readyQueue = [];
    });
  }

  function ensureReady(callback) {
    if (isReady) return callback();
    readyQueue.push(callback);

    if (!client) {
      initClient();
    }
  }

  function generateCart() {
    ensureReady(async function () {
      try {
        const container = document.querySelector(".global-cart-container");
        if (!container) {
          console.error("container not found");
          return;
        }

        ui.createComponent("cart", {
          node: container,
          moneyFormat: "%E2%82%B1%7B%7Bamount%7D%7D",

          options: {
            cart: {
              // iframe: false,
              styles: {
                button: {
                  ":hover": {
                    "background-color": "#832036",
                  },
                  "background-color": "#4d1320",
                  ":focus": {
                    "background-color": "#832036",
                  },
                },
                title: {
                  color: "#4d1320",
                },
                header: {
                  color: "#4d1320",
                },
                lineItems: {
                  color: "#4d1320",
                },
                subtotalText: {
                  color: "#4d1320",
                },
                subtotal: {
                  color: "#4d1320",
                },
                notice: {
                  color: "#4d1320",
                },
                currency: {
                  color: "#4d1320",
                },
                close: {
                  color: "#4d1320",
                  ":hover": {
                    color: "#4d1320",
                  },
                },
                empty: {
                  color: "#4d1320",
                },
                noteDescription: {
                  color: "#4d1320",
                },
                discountText: {
                  color: "#4d1320",
                },
                discountIcon: {
                  fill: "#4d1320",
                },
                discountAmount: {
                  color: "#4d1320",
                },
              },
              text: {
                total: "Subtotal",
                button: "Checkout",
              },
              events: {
                afterInit: (component) => {
                  cart = component;
                },
              },
            },
            toggle: {
              styles: {
                toggle: {
                  "background-color": "#4d1320",
                  ":hover": {
                    "background-color": "#832036",
                  },
                  ":focus": {
                    "background-color": "#832036",
                  },
                },
              },
            },
            lineItem: {
              styles: {
                variantTitle: {
                  color: "#4d1320",
                },
                title: {
                  color: "#4d1320",
                },
                price: {
                  color: "#4d1320",
                },
                fullPrice: {
                  color: "#4d1320",
                },
                discount: {
                  color: "#4d1320",
                },
                discountIcon: {
                  fill: "#4d1320",
                },
                quantity: {
                  color: "#4d1320",
                },
                quantityIncrement: {
                  color: "#4d1320",
                  "border-color": "#4d1320",
                },
                quantityDecrement: {
                  color: "#4d1320",
                  "border-color": "#4d1320",
                },
                quantityInput: {
                  color: "#4d1320",
                  "border-color": "#4d1320",
                },
              },
            },
          },
        });
      } catch (error) {
        console.error(error);
        container.remove();
      }
    });
  }

  function loadVariant(node) {
    ensureReady(async function () {
      try {
        const variant = (
          await client.product.fetch(
            `gid://shopify/Product/${node.dataset.productId}`,
          )
        ).variants[0];

        const available = variant.available;
        const quantityAvailable = variant.quantityAvailable;

        if (!available) {
          const wineSelector = `[data-wine="${node.dataset.wine}"]`;
          // Out of stock text
          const outOfStockText = document.querySelector(
            `.out-of-stock-text${wineSelector}`,
          );

          if (outOfStockText != null) {
            outOfStockText.classList.remove("hidden");
          }

          // Add to cart button
          const addToCartButton = document.querySelector(
            `.add-to-cart-button${wineSelector}`,
          );

          if (addToCartButton != null) {
            addToCartButton
              .querySelectorAll("button")
              .forEach((button) => (button.disabled = true));
            addToCartButton.disabled = true;
          }

          // Buy now button
          const buyNowButton = document.querySelector(
            `.buy-now-button${wineSelector}`,
          );

          if (buyNowButton != null) {
            buyNowButton
              .querySelectorAll("button")
              .forEach((button) => (button.disabled = true));
            buyNowButton.disabled = true;
          }

          // Quantity input
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

          priceText.textContent = new Intl.NumberFormat("en-PH", {
            style: "currency",
            currency: currencyCode,
          }).format(amount);

          priceText.classList.remove("hidden");
        }

        variantIds[node.dataset.productId] = variant;
      } catch (error) {
        console.error(error);
      }
    });
  }

  async function onAddToCartClick(node) {
    const productId = node.dataset.productId;
    if (!productId) {
      console.error("product not found");
      return;
    }

    const variantId = variantIds[productId];
    if (!variantId) {
      console.error("variant not found");
      return;
    }

    let quantity = 1;
    const input = document.querySelector(
      `.quantity-input-container[data-wine="${node.dataset.wine}"] input[name="quantity"]`,
    );

    if (input != null && input.value.trim() !== "") {
      quantity = parseInt(input.value);
    }

    await cart.addVariantToCart(variantId, quantity);
  }

  return {
    loadVariant,
    onAddToCartClick,
    generateCart,
  };
})();

document.addEventListener("DOMContentLoaded", () => {
  document
    .querySelectorAll(".add-to-cart-button[data-wine][data-product-id]")
    .forEach((node) => {
      window.ShopifyBuyManager.loadVariant(node);

      node.addEventListener("click", async (event) => {
        window.ShopifyBuyManager.onAddToCartClick(
          event.target.closest("[data-wine][data-product-id]"),
        );
      });
    });
});
