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
        title: "Select Media",
        multiple: true,
        library: { type: "image,video" },
        button: { text: "Use Selected Media" },
      });

      frame.on("select", () => {
        const attachments = frame.state().get("selection").toJSON();
        const ids = attachments.map((a) => a.id);

        wp.customize(setting).set(JSON.stringify({ ids }));

        $control.val(`${attachments.length} media selected`);
      });

      frame.open();
    });
  });
});
