<template>
  <!--
    Decorative only: two corner watermarks with no information in them.

    `alt=""` marks them as presentational so a screen reader skips them. They were
    `alt="grid"`, which announced the word "grid" twice on the auth pages and again on
    the 404 - naming a decoration rather than describing it, and describing it badly.
  -->
  <div aria-hidden="true">
    <div class="absolute end-0 top-0 -z-1 w-full max-w-[250px] xl:max-w-[450px]">
      <img src="/images/shape/grid-01.svg" alt="" />
    </div>
    <div class="absolute bottom-0 start-0 -z-1 w-full max-w-[250px] rotate-180 xl:max-w-[450px]">
      <img src="/images/shape/grid-01.svg" alt="" />
    </div>
  </div>
</template>
