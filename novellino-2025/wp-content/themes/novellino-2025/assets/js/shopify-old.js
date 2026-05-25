var scriptURL =
  "https://sdks.shopifycdn.com/buy-button/latest/buy-button-storefront.min.js";
if (window.ShopifyBuy) {
  if (window.ShopifyBuy.UI) {
    initShopifyClient();
  } else {
    loadShopifyScript();
  }
} else {
  loadShopifyScript();
}

function loadShopifyScript() {
  var script = document.createElement("script");
  script.async = true;
  script.src = scriptURL;
  (
    document.getElementsByTagName("head")[0] ||
    document.getElementsByTagName("body")[0]
  ).appendChild(script);
  script.onload = initShopifyClient;
}

var shopifyClient = null;

function initShopifyClient() {
  shopifyClient = ShopifyBuy.buildClient({
    domain: "81zwvz-ki.myshopify.com", // same
    storefrontAccessToken: "b0f54e6e38dae272135d36bbeb7b7a24", // same
  });
}

function createShopifyAddToCartButton(productId, elementId) {
  if (!shopifyClient) {
    console.error("client does not exist");
  }

  ShopifyBuy.UI.onReady(shopifyClient).then(function (ui) {
    ui.createComponent("product", {
      id: productId, // different per wine
      node: document.getElementById(elementId),
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
                "background-color": "#8f2222",
              },
              "background-color": "#541414",
              ":focus": {
                "background-color": "#8f2222",
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
                "background-color": "#8f2222",
              },
              "background-color": "#541414",
              ":focus": {
                "background-color": "#8f2222",
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
                "background-color": "#8f2222",
              },
              "background-color": "#541414",
              ":focus": {
                "background-color": "#8f2222",
              },
            },
            title: {
              color: "#3d0808",
            },
            header: {
              color: "#3d0808",
            },
            lineItems: {
              color: "#3d0808",
            },
            subtotalText: {
              color: "#3d0808",
            },
            subtotal: {
              color: "#3d0808",
            },
            notice: {
              color: "#3d0808",
            },
            currency: {
              color: "#3d0808",
            },
            close: {
              color: "#3d0808",
              ":hover": {
                color: "#3d0808",
              },
            },
            empty: {
              color: "#3d0808",
            },
            noteDescription: {
              color: "#3d0808",
            },
            discountText: {
              color: "#3d0808",
            },
            discountIcon: {
              fill: "#3d0808",
            },
            discountAmount: {
              color: "#3d0808",
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
              "background-color": "#541414",
              ":hover": {
                "background-color": "#8f2222",
              },
              ":focus": {
                "background-color": "#8f2222",
              },
            },
          },
        },
        lineItem: {
          styles: {
            variantTitle: {
              color: "#3d0808",
            },
            title: {
              color: "#3d0808",
            },
            price: {
              color: "#3d0808",
            },
            fullPrice: {
              color: "#3d0808",
            },
            discount: {
              color: "#3d0808",
            },
            discountIcon: {
              fill: "#3d0808",
            },
            quantity: {
              color: "#3d0808",
            },
            quantityIncrement: {
              color: "#3d0808",
              "border-color": "#3d0808",
            },
            quantityDecrement: {
              color: "#3d0808",
              "border-color": "#3d0808",
            },
            quantityInput: {
              color: "#3d0808",
              "border-color": "#3d0808",
            },
          },
        },
      },
    });
  });
}
