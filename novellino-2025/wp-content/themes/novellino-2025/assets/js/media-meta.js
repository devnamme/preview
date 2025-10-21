(function ($) {
  $(document).on("click", ".media-meta-select-image", function (event) {
    event.preventDefault();

    var field = $(this).data("field");
    var targetInput = $(`input[id=${field}]`);
    var targetPreview = $(`img[id=${field}_preview]`);

    // Create the media frame.
    const file_frame = wp.media({
      title: "Select or Upload Image",
      button: {
        text: "Use this image",
      },
      multiple: false,
    });

    // When an image is selected
    file_frame.on("select", function () {
      var attachment = file_frame.state().get("selection").first().toJSON();
      targetInput.val(attachment.id);
      targetPreview.attr("src", attachment.url).show();

      // show remove button and update select button text
      $('.media-meta-remove-image[data-field="' + field + '"]').show();
      $('.media-meta-select-image[data-field="' + field + '"]').text(
        "Change image"
      );
    });

    file_frame.open();
  });

  $(document).on("click", ".media-meta-remove-image", function (event) {
    event.preventDefault();

    var field = $(this).data("field");
    $(`input[id=${field}]`).val("");
    $(`img[id=${field}_preview]`).attr("src", "").hide();
    $(this).hide();

    $('.media-meta-select-image[data-field="' + field + '"]').text(
      "Select image"
    );
  });
})(jQuery);
