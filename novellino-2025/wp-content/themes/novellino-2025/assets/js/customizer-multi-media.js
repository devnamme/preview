jQuery(document).ready(($) => {
  const settings = [
    "nv_index_wines_carousel",
    "nv_index_perfect_pour_carousel",
  ];

  settings.forEach((setting) => {
    const $control = $(`input[data-customize-setting-link=${setting}]`);
    const $button = $(
      '<button type="button" class="button">Select Media</button>'
    );
    $control.after($button);

    $button.on("click", (e) => {
      e.preventDefault();

      const frame = wp.media({
        title: "Select Images",
        multiple: true,
        library: { type: "image" },
        button: { text: "Use Selected Images" },
      });

      frame.on("select", () => {
        const attachments = frame.state().get("selection").toJSON();
        const ids = attachments.map((a) => a.id);

        wp.customize(setting).set(JSON.stringify({ ids }));

        $control.val(`${attachments.length} images selected`);
      });

      frame.open();
    });
  });
});
