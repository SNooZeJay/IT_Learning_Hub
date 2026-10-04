<template>
  <!--
    The IT Learning Hub mark, from the project's own asset.

    Constraints this component exists to enforce, because every consumer would
    otherwise re-decide them:

    - `alt=""` because the product name always sits beside this mark. Announcing
      both makes a screen reader say the name twice.
    - Never restyled, recoloured or given a shadow. The asset is used as drawn.
    - Sized by the consumer, never enlarged past 64px, and square so there is no
      proportion to distort.

    The intrinsic asset is 230x230, so it renders crisply at any size we use.
  -->
  <img
    src="/images/logo/it-learning-hub.webp"
    alt=""
    width="230"
    height="230"
    class="object-contain"
  />
</template>

<script setup lang="ts">
/**
 * The product's own logo, used as-is.
 *
 * It is a component rather than a bare <img> so the sizing rule and the empty alt
 * are decided once. Five call sites already needed it and each would have been a
 * place to get the alt text wrong.
 */
defineOptions({ inheritAttrs: true })
</script>
