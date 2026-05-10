function toggleShopList() {
  const container = document.getElementById("shop-now-container");
  const menu = document.getElementById("shop-now-menu");
  container.dataset.active =
    container.dataset.active === "true" ? "false" : "true";

  const isActive = container.dataset.active === "true";
  if (isActive) {
    Motion.animate(
      menu,
      {
        display: ["none", "flex"],
        opacity: [0, 1],
      },
      {
        duration: 0.3,
        ease: "linear",
      }
    );
  } else {
    Motion.animate(
      menu,
      {
        display: ["flex", "none"],
        opacity: [1, 0],
      },
      {
        duration: 0.3,
        ease: "linear",
      }
    );
  }
}

document.addEventListener("click", (event) => {
  if (
    !event.target.closest("#shop-now-container") &&
    document.getElementById("shop-now-container").dataset.active === "true"
  ) {
    toggleShopList();
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const header = document.querySelector("header");
  const body = document.getElementById("main-body") ?? document.documentElement;

  if (!header.dataset.alwaysActive) {
    Motion.scroll(
      (y) => {
        const isPastHero =
          y * (body.scrollHeight - window.innerHeight) > window.innerHeight;

        if (isPastHero) {
          header.dataset.active = true;
        } else {
          delete header.dataset.active;
        }
      },
      {
        source: body,
        target: body,
      }
    );
  }
});

function openMobileNav() {
  const header = document.querySelector("header");
  header.dataset.activeMobileNav = true;
  const wrapper = document.querySelector(".mobile-nav-wrapper");
  wrapper.dataset.active = true;
  const mobileNav = wrapper.querySelector(".mobile-nav");

  Motion.animate(
    wrapper,
    {
      opacity: [0, 1],
    },
    {
      duration: 0.3,
    }
  );

  Motion.animate(
    mobileNav,
    {
      translateY: ["-100%", "0%"],
    },
    {
      duration: 0.3,
    }
  );

  document
    .querySelectorAll(".open-mobile-nav, .close-mobile-nav")
    .forEach((el) => {
      el.classList.toggle("hidden");
    });
}

async function closeMobileNav() {
  const header = document.querySelector("header");
  delete header.dataset.activeMobileNav;
  const wrapper = document.querySelector(".mobile-nav-wrapper");
  const mobileNav = wrapper.querySelector(".mobile-nav");

  document
    .querySelectorAll(".open-mobile-nav, .close-mobile-nav")
    .forEach((el) => {
      el.classList.toggle("hidden");
    });

  Motion.animate(
    mobileNav,
    {
      translateY: ["0%", "-100%"],
    },
    {
      duration: 0.3,
    }
  );

  await Motion.animate(
    wrapper,
    {
      opacity: [1, 0],
    },
    {
      duration: 0.3,
    }
  ).finished.then(() => {
    delete wrapper.dataset.active;
  });
}

function onMobileNavWrapperClick(event) {
  if (!event.target.closest(".mobile-nav")) {
    closeMobileNav();
  }
}
