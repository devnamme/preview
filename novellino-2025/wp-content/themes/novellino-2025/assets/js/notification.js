window.NotificationService = (function () {
  let clearTimer = null;

  const TYPE = {
    ADDED_TO_CART: "ADDED_TO_CART",
    GENERIC_ERROR: "GENERIC_ERROR",
    TEXT: "TEXT",
  };

  function clearNotifications() {
    const container = document.querySelector(".notification-container");

    [...container.children].forEach((notification) => {
      notification.classList.replace("opacity-100", "opacity-0");
      notification.classList.add("pointer-events-none");
      notification.addEventListener(
        "transitionend",
        () => {
          container.removeChild(notification);
        },
        { once: true },
      );
    });
  }

  function showNotification(type, data) {
    const container = document.querySelector(".notification-container");
    if (!container) {
      console.error("container not found");
      return;
    }

    clearNotifications();

    switch (type) {
      case TYPE.ADDED_TO_CART:
        container.innerHTML = `
<div class="opacity-0 transition-opacity rounded-xl px-6 py-3 w-full md:w-90 bg-white shadow-[0_8px_24px_0_#959DA533] notification">
  <div class="mb-3 flex flex-row items-center gap-x-2 justify-between">
    <svg
      class="size-4.5 text-[#212121]"
      xmlns="http://www.w3.org/2000/svg" width="32" height="32"
      fill="currentColor"
      viewBox="0 0 256 256"
    >
      <path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z" />
    </svg>

    <p class="grow text-[#212121]">Added to cart</p>

    <svg
      class="grow-0 shrink-0 size-4.5 text-[#78909C] cursor-pointer"
      xmlns="http://www.w3.org/2000/svg" width="32" height="32"
      fill="currentColor"
      viewBox="0 0 256 256"
      onclick="NotificationService.clearNotifications();"
    >
      <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" />
    </svg>
  </div>

  <div class="flex flex-row items-center gap-x-6">
    <div class="grow-0 shrink-0 rounded-xl size-20 ${data.premium ? "bg-red-secondary" : "bg-red-custom-light"}">
      <img
        class="size-full object-contain object-center"
        src="${data.thumbnailUrl}"
        alt="${data.name}"
      />
    </div>

    <div class="grow shrink">
      <p class="mb-1 text-lg font-extrabold">${data.name}</p>
      <p class="font-medium">${data.price}</p>
    </div>

    <p class="grow-0 shrink-0 text-lg font-medium text-[#546E7A] text-right">
      x${data.quantity}
    </p>
  </div>
</div>`;

        break;

      case TYPE.GENERIC_ERROR:
      case TYPE.TEXT:
        container.innerHTML = `
<div class="opacity-0 transition-opacity rounded-xl px-6 py-3 w-full md:w-90 bg-white flex flex-row gap-x-2 items-center shadow-[0_8px_24px_0_#959DA533] notification">
  <svg
    class="grow-0 shrink-0 size-4 text-red-primary self-start"
    xmlns="http://www.w3.org/2000/svg" width="32" height="32"
    fill="currentColor"
    viewBox="0 0 256 256"
  >
    <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm16-40a8,8,0,0,1-8,8,16,16,0,0,1-16-16V128a8,8,0,0,1,0-16,16,16,0,0,1,16,16v40A8,8,0,0,1,144,176ZM112,84a12,12,0,1,1,12,12A12,12,0,0,1,112,84Z" />
  </svg>

  <p class="grow shrink">
    ${data?.text ?? "Something went wrong on our end. Please try again in a moment."}
  </p>

  <svg
    class="grow-0 shrink-0 size-4.5 text-[#78909C] cursor-pointer"
    xmlns="http://www.w3.org/2000/svg" width="32" height="32"
    fill="currentColor"
    viewBox="0 0 256 256"
    onclick="NotificationService.clearNotifications();"
  >
    <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" />
  </svg>
</div>`;
        break;

      default:
        return;
    }

    requestAnimationFrame(() => {
      container
        .querySelector(".notification")
        .classList.replace("opacity-0", "opacity-100");
    });

    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => clearNotifications(), 5000);
  }

  return {
    TYPE,
    clearNotifications,
    showNotification,
  };
})();
