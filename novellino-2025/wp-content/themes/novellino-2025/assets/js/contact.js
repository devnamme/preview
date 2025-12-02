var active_form_tab = "BUY";

function setActiveFormTab(event) {
  const form = document.getElementById("contact-form");
  const tab = event.target.dataset.tab;
  const buttons = document.querySelectorAll("button[data-tab]");

  active_form_tab = tab;
  buttons.forEach((button) => {
    button.dataset.active = button.dataset.tab === tab;
  });

  document.getElementById("mode").value = tab;

  if (tab === "BUY") {
    form.querySelectorAll("[data-sell-only]").forEach((el) => {
      el.classList.add("hidden");
    });
    form.querySelectorAll("[data-buy-only]").forEach((el) => {
      el.classList.remove("hidden");
    });

    form
      .querySelectorAll(
        "[data-field-name='company'] .required-text, [data-field-name='position'] .required-text"
      )
      .forEach((el) => {
        el.classList.add("hidden");
      });
  } else {
    form.querySelectorAll("[data-buy-only]").forEach((el) => {
      el.classList.add("hidden");
    });
    form.querySelectorAll("[data-sell-only]").forEach((el) => {
      if (el.dataset.fieldName !== "business-type-others") {
        el.classList.remove("hidden");
      } else {
        if (
          form.querySelector("[data-field-name='business-type'] select")
            .value === "others"
        ) {
          el.classList.remove("hidden");
        }
      }
    });

    form
      .querySelectorAll(
        "[data-field-name='company'] .required-text, [data-field-name='position'] .required-text"
      )
      .forEach((el) => {
        el.classList.remove("hidden");
      });
  }

  document.querySelectorAll("[data-has-error]").forEach((el) => {
    delete el.dataset.hasError;
  });
}

function onBusinessTypeChange(event) {
  const value = event.target.value;

  const specifyGroup = document.querySelector(
    "[data-field-name='business-type-others']"
  );
  if (value === "others") {
    specifyGroup.classList.remove("hidden");
  } else {
    specifyGroup.classList.add("hidden");
  }

  if (event.target.dataset.hasError) {
    delete event.target.dataset.hasError;
  }
}

function onContactCheckboxChange(event) {
  const target = event.target;
  const isChecked = target.checked;

  const subfield = target
    .closest(".group[data-field-name]")
    .parentNode.querySelector("[data-contact-field]");
  if (isChecked) {
    subfield.classList.remove("hidden");
  } else {
    subfield.classList.add("hidden");
  }
  delete subfield.dataset.hasError;

  // remove all errors
  target
    .closest(".contact-group")
    .querySelectorAll("[data-field-name^='contact_'][data-has-error]")
    .forEach((el) => {
      delete el.dataset.hasError;
    });
}

function reorderProductIds() {
  const container = document.getElementById("requests-container");

  Array.from(container.children).forEach((group, idx) => {
    const names = ["quantity", "units", "product"];
    for (let i = 0; i < names.length; i++) {
      const dataEls = group.querySelectorAll(
        `[data-field-name^="${names[i]}-"`
      );
      const idEls = group.querySelectorAll(`[id^="${names[i]}-"]`);
      const nameEls = group.querySelectorAll(`[name^="${names[i]}-"]`);
      const forEls = group.querySelectorAll(`[for^="${names[i]}-"]`);

      dataEls.forEach((el) => {
        el.dataset.fieldName = `${names[i]}-${idx}`;
      });
      idEls.forEach((el) => {
        el.setAttribute("id", `${names[i]}-${idx}`);

        if (i === 0 && el.tagName === "INPUT") {
          el.value = 1;
        }
      });
      nameEls.forEach((el) => {
        el.setAttribute("name", `${names[i]}-${idx}`);
      });
      forEls.forEach((el) => {
        el.setAttribute("for", `${names[i]}-${idx}`);
      });
    }
  });
}

function addProduct() {
  const clone = productRow.cloneNode(true);
  document.getElementById("requests-container").appendChild(clone);
  reorderProductIds();
}

function removeProduct(event) {
  event.target.closest(".request-row").remove();
  reorderProductIds();
}

function onIncrementButtonClick(event, delta) {
  const root = event.target.closest("[data-field-name]");
  const input = root.querySelector("input");

  let value = input.value;
  if (value === "") {
    input.value = 1;
  } else {
    value = parseInt(value) + delta;
    if (value <= 1) {
      value = 1;
    }

    input.value = value;
  }
}

function setFieldGroupError(element) {
  element.closest(".group[data-field-name]").dataset.hasError = true;
}

function buildContactFormData() {
  const form = document.getElementById("contact-form");
  const formdata = new FormData(form);

  return formdata;
}

function validateContactForm() {
  const form = document.getElementById("contact-form");
  const formdata = buildContactFormData();
  const mode = formdata.get("mode");
  let isValid = true;

  // singular fields
  let singleFields = [];
  if (mode === "BUY") {
    singleFields = ["name", "address"];
  } else {
    singleFields = ["name", "company", "position", "business-type", "address"];
  }

  singleFields.forEach((name) => {
    if (!formdata.get(name)) {
      setFieldGroupError(form.elements[name]);
      isValid = false;
    }
  });

  // sell > business type > others
  if (
    mode === "SELL" &&
    formdata.get("business-type") === "others" &&
    !formdata.get("business-type-others")
  ) {
    setFieldGroupError(form.elements["business-type-others"]);
    isValid = false;
  }

  // contact information
  let hasValidContact = false;
  form.elements.contact.forEach((field) => {
    if (field.checked) {
      hasValidContact = true;

      if (!formdata.get(`contact-${field.value}`)) {
        setFieldGroupError(form.elements[`contact-${field.value}`]);
        isValid = false;
      }
    }
  });

  if (!hasValidContact) {
    form.elements.contact.forEach((field) => {
      setFieldGroupError(field);
      isValid = false;
    });
  }

  // buy > request
  if (mode === "BUY") {
    const container = document.getElementById("requests-container");
    const count = container.children.length;

    const fields = ["quantity", "units", "product"];
    for (let i = 0; i < count; i++) {
      for (let j = 0; j < fields.length; j++) {
        if (!formdata.get(`${fields[j]}-${i}`)) {
          setFieldGroupError(form.elements[`${fields[j]}-${i}`]);
          isValid = false;
        }
      }
    }
  }

  if (isValid) {
    submitContactForm(formdata);
  } else {
    window.scrollTo({
      top:
        document.querySelector(".form-header").getBoundingClientRect().top +
        window.scrollY -
        120,
      behavior: "smooth",
    });
  }
}

function submitContactForm(formdata) {
  // TODO AJAX

  // on success
  document.querySelector(".form-header").classList.add("hidden!");
  document.querySelector("#contact-form").classList.add("hidden!");
  const successContainer = document.querySelector(".form-success-container");
  successContainer.classList.remove("hidden!");

  window.scrollTo({
    top: successContainer.getBoundingClientRect().top + window.scrollY - 120,
    behavior: "smooth",
  });
}

function startAnotherForm() {
  const form = document.getElementById("contact-form");
  form.reset();

  // hide business type
  if (form.elements.mode.value === "SELL") {
    form.elements["business-type-others"]
      .closest(".group[data-field-name]")
      .classList.add("hidden");
  }

  // hide contact fields
  document.querySelectorAll("[data-field-name^='contact-'").forEach((el) => {
    el.classList.add("hidden");
  });

  // remove buy request rows
  document.getElementById("requests-container").replaceChildren();
  addProduct();
  reorderProductIds();

  // display
  document.querySelector(".form-header").classList.remove("hidden!");
  form.classList.remove("hidden!");
  const successContainer = document.querySelector(".form-success-container");
  successContainer.classList.add("hidden!");
}

function onInputChangeListener(event) {
  const group = event.target.closest(".group[data-field-name]");
  if (group.dataset.hasError) {
    delete group.dataset.hasError;
  }
}

var productRow = null;

document.addEventListener("DOMContentLoaded", () => {
  document
    .querySelectorAll(
      "#contact-form input:not([type=checkbox]), #contact-form select"
    )
    .forEach((el) => {
      el.addEventListener("change", onInputChangeListener);
    });

  productRow = document
    .getElementById("requests-container")
    .lastElementChild.cloneNode(true);
});
