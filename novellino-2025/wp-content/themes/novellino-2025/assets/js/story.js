document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".replace-novellino").forEach((el) => {
    const image = document.createElement("img");
    image.setAttribute("src", storyData.logoUrl);
    image.className =
      "inline-block h-[56px] lg:h-[144px] object-contain -mx-4 lg:-mx-8 -mt-6 -mb-4 lg:-mt-8";
    el.replaceWith(image);
  });

  let lastY = null;

  document
    .querySelectorAll("[data-year-group]:not(nav [data-year-group])")
    .forEach((group, idx) => {
      Motion.scroll(
        (y) => {
          if (!lastY) {
            lastY = y;

            if (idx === 0) {
              document.querySelector("nav [data-year-group]").dataset.active =
                true;
            }
            return;
          }

          document.querySelectorAll("nav [data-year-group]").forEach((link) => {
            if (link.dataset.yearGroup === group.dataset.yearGroup) {
              link.dataset.active = true;
            } else {
              delete link.dataset.active;
            }
          });

          lastY = y;
        },
        {
          source: document.documentElement,
          target: group,
          offset: ["start center", "end center"],
        }
      );
    });

  const lastTopY = {};

  document.querySelectorAll(".group\\/content").forEach((group, idx) => {
    Motion.scroll(
      (y) => {
        if (!lastY) {
          lastY = y;
          if (idx === 0) {
            group.dataset.active = true;
          }
          return;
        }

        if (window.innerWidth < 1024) {
          group.style.transform = "";
          group.style.opacity = "";
          group.dataset.active = true;
        } else {
          if (y >= 0 && y < 0.3) {
            delete group.dataset.active;
            group.style.transform = "";
            group.style.opacity = "";
          } else if (y >= 0.3 && y < 0.6) {
            group.dataset.active = true;
            group.style.transform = "";
            group.style.opacity = "";
          } else if (y >= 0.6) {
            delete group.dataset.active;

            const translateY = Math.round(500 * ((y - 0.6) / 0.4));
            const scale = 1 - (y - 0.6) / 0.4;

            group.style.transform = `translate(0, ${translateY}px) scale(${scale})`;
            group.style.opacity = scale;
          }
        }

        lastTopY[idx] = Math.round(y * 100) / 100;
      },
      {
        source: document.documentElement,
        target: group,
        offset: ["start end", "end start"],
      }
    );
  });
});

function scrollToYearGroup(yearGroup) {
  window.scrollTo({
    top:
      document
        .querySelector(
          `[data-year-group="${yearGroup}"]:not(nav > [data-year-group="${yearGroup}"])`
        )
        .getBoundingClientRect().top +
      window.scrollY -
      document.querySelector("header").getBoundingClientRect().height -
      document.querySelector(".year-group-nav").getBoundingClientRect().height,
    behavior: "smooth",
  });
}
