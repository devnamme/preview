document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".replace-novellino").forEach((el) => {
    const image = document.createElement("img");
    image.setAttribute("src", storyData.logoUrl);
    image.className = "inline-block h-[56px] lg:h-[144px] object-contain -m-4";
    el.replaceWith(image);
  });
});
