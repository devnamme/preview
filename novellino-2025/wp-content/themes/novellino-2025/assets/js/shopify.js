window.ShopifyBuyManager = (function () {
  let client = null;
  let ui = null;
  let isReady = false;
  let readyQueue = [];

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
        if (!container) return;

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

  function generateAddToCartButton(productId, wineSlug) {
    ensureReady(async function () {
      const container = document.querySelector(
        `.add-to-cart-container[data-wine="${wineSlug}"]`,
      );
      if (!container) return;

      try {
        const product = await client.product.fetch(
          `gid://shopify/Product/${productId}`,
        );

        ui.createComponent("product", {
          id: productId,
          node: container,
          moneyFormat: "%E2%82%B1%7B%7Bamount%7D%7D",

          options: {
            product: {
              iframe: false,
              styles: {
                product: {
                  "@media (min-width: 601px)": {
                    "max-width": "calc(25% - 20px)",
                    "margin-left": "20px",
                    "margin-bottom": "50px",
                  },
                },
                button: {
                  ":hover": {
                    "background-color": "#832036",
                  },
                  "background-color": "#4d1320",
                  ":focus": {
                    "background-color": "#832036",
                  },
                },
              },
              contents: {
                img: false,
                title: false,
                price: false,
              },
              text: {
                button: "Add to cart",
              },
            },
          },
        });

        document
          .querySelector(`.add-to-cart-custom-button[data-wine="${wineSlug}"]`)
          ?.addEventListener("click", (event) => {
            event.preventDefault();
            container.querySelector("button.shopify-buy__btn")?.click();
          });
      } catch (error) {
        console.error(error);
        container.remove();
      }
    });
  }

  return {
    generateCart,
    generateAddToCartButton,
  };
})();
