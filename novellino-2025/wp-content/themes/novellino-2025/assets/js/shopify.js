window.ShopifyBuyManager = (function () {
  let client = null;
  let ui = null;
  let isReady = false;
  let readyQueue = [];

  let cart = null;
  let variants = {};

  function initClient() {
    try {
      client = ShopifyBuy.buildClient({
        domain: "81zwvz-ki.myshopify.com",
        storefrontAccessToken: "b0f54e6e38dae272135d36bbeb7b7a24",
      });
    } catch (error) {
      NotificationService.showNotification(
        NotificationService.TYPE.GENERIC_ERROR,
      );
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
      let container = null;
      try {
        container = document.querySelector(".global-cart-container");
        if (!container) {
          throw "container not found";
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

                afterRender: (component) => {
                  const count = component.model.lineItems.reduce(
                    (total, item) => total + item.quantity,
                    0,
                  );

                  updateCartCount(count);
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
        NotificationService.showNotification(
          NotificationService.TYPE.GENERIC_ERROR,
        );
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

        variants[node.dataset.productId] = variant;
      } catch (error) {
        NotificationService.showNotification(
          NotificationService.TYPE.GENERIC_ERROR,
        );
        console.error(error);
      }
    });
  }

  async function onAddToCartClick(node) {
    const wineSelector = `[data-wine="${node.dataset.wine}"]`;

    try {
      const productId = node.dataset.productId;
      if (!productId) {
        throw "product not found";
      }

      const variant = variants[productId];
      if (!variant) {
        throw "variant not found";
        return;
      }

      let quantity = 1;
      const input = document.querySelector(
        `.quantity-input-container${wineSelector} input[name="quantity"]`,
      );

      if (input != null && input.value.trim() !== "") {
        quantity = parseInt(input.value);
      }

      document
        .querySelectorAll(
          `.quantity-input-container${wineSelector} button, .quantity-input-container${wineSelector} input, .add-to-cart-button${wineSelector}`,
        )
        .forEach((el) => {
          el.dataset.adding = true;
          el.disabled = true;
        });

      await cart.addVariantToCart(variant, quantity).then(() => {
        NotificationService.showNotification(
          NotificationService.TYPE.ADDED_TO_CART,
          {
            name: document.querySelector(`.name-text${wineSelector}`)
              ?.innerText,
            quantity,
            price: new Intl.NumberFormat("en-PH", {
              style: "currency",
              currency: variant.priceV2.currencyCode,
            }).format(variant.priceV2.amount),
            thumbnailUrl: variant?.image?.src,
            premium: (
              document.querySelector(`.thumbnail${wineSelector}`)?.classList ??
              []
            ).contains("premium"),
          },
        );
      });
    } catch (error) {
      NotificationService.showNotification(
        NotificationService.TYPE.GENERIC_ERROR,
      );
      console.error(error);
    } finally {
      document
        .querySelectorAll(
          `.quantity-input-container${wineSelector} button, .quantity-input-container${wineSelector} input, .add-to-cart-button${wineSelector}`,
        )
        .forEach((el) => {
          delete el.dataset.adding;
          el.disabled = false;
        });
    }
  }

  async function onBuyNowClick(node) {
    try {
      const productId = node.dataset.productId;
      if (!productId) {
        throw "product not found";
        return;
      }

      const variant = variants[productId];
      if (!variant) {
        throw "variant not found";
        return;
      }

      const checkout = await client.checkout.create();

      const lineItems = [
        {
          variantId: variant.id,
          quantity: 1,
        },
      ];

      const updatedCheckout = await client.checkout.addLineItems(
        checkout.id,
        lineItems,
      );

      window.open(updatedCheckout.webUrl);
    } catch (error) {
      NotificationService.showNotification(
        NotificationService.TYPE.GENERIC_ERROR,
      );
      console.error(error);
    }
  }

  function openCart() {
    setTimeout(() => {
      cart.open();
    }, 0);
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
      NotificationService.showNotification(
        NotificationService.TYPE.GENERIC_ERROR,
      );
      console.error(error);
    }
  }

  return {
    loadVariant,
    onAddToCartClick,
    onBuyNowClick,
    generateCart,
    openCart,
  };
})();

document.addEventListener("DOMContentLoaded", () => {
  document
    .querySelectorAll(".add-to-cart-button[data-wine][data-product-id]")
    .forEach((node) => {
      try {
        window.ShopifyBuyManager.loadVariant(node);

        node.addEventListener("click", async (event) => {
          window.ShopifyBuyManager.onAddToCartClick(
            event.target.closest("[data-wine][data-product-id]"),
          );
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
      node.addEventListener("click", (event) => {
        window.ShopifyBuyManager.onBuyNowClick(event.target);
      });
    });
});
