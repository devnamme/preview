jQuery(document).ready(($) => {
  const $control = $(
    "input[data-customize-setting-link=nv_index_wines_carousel]"
  );
  const $button = $(
    '<button type="button" class="button">Select Images</button>'
  );
  $control.after($button);

  $button.on("click", (e) => {
    e.preventDefault();

    const frame = wp.media({
      title: "Select Wine Images",
      multiple: true,
      library: { type: "image" },
      button: { text: "Use Selected Images" },
    });

    frame.on("select", () => {
      const attachments = frame.state().get("selection").toJSON();
      const ids = attachments.map((a) => a.id);
      const urls = attachments.map((a) => a.url);

      wp.customize("nv_index_wines_carousel").set(JSON.stringify({ ids }));

      $control.val(`${attachments.length} images selected`);
    });

    frame.open();
  });
});
