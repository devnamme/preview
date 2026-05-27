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

  function generateAddToCartButton(productId, targetElementId, els = {}) {
    ensureReady(async function () {
      const node = document.getElementById(targetElementId);
      if (!node) return;

      try {
        const product = await client.product.fetch(
          `gid://shopify/Product/${productId}`,
        );

        ui.createComponent("product", {
          id: productId,
          node: node,
          moneyFormat: "%E2%82%B1%7B%7Bamount%7D%7D",

          options: {
            product: {
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
            productSet: {
              styles: {
                products: {
                  "@media (min-width: 601px)": {
                    "margin-left": "-20px",
                  },
                },
              },
            },
            modalProduct: {
              contents: {
                img: false,
                imgWithCarousel: true,
                button: false,
                buttonWithQuantity: true,
              },
              styles: {
                product: {
                  "@media (min-width: 601px)": {
                    "max-width": "100%",
                    "margin-left": "0px",
                    "margin-bottom": "0px",
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
              text: {
                button: "Add to cart",
              },
            },
            option: {},
            cart: {
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

        // if (els.addToCartButton && els.outOfStockButton) {
        //   if (product.availableForSale) {
        //     els.outOfStockButton.remove();
        //     els.addToCartButton.classList.remove("hidden");

        //     els.addToCartButton.onclick = null;
        //     els.addToCartButton.addEventListener("click", async () => {
        //       // THIS is the correct Buy Button-safe way:
        //       // ui.components.cart.addVariantToCart(variantId, 1);
        //       // const foo = document.querySelector(".shopify-buy__btn");
        //       // console.log(foo);
        //       // console.log(node.querySelector(".shopify-buy__btn"));
        //     });
        //   } else {
        //     els.addToCartButton?.remove();
        //     els.outOfStockButton?.classList.remove("hidden");
        //   }
        // }
      } catch (error) {
        console.error(error);
      } finally {
        els.loader?.remove();
      }
    });
  }

  return {
    generateAddToCartButton,
  };
})();
