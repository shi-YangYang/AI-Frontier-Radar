<template>
  <p v-if="message.length > 0 && !removed" class="notice" :class="{ danger, hiding }" role="status">
    {{ message }}
  </p>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps<{
  danger?: boolean;
  message: string;
}>();

const NOTICE_AUTO_HIDE_DELAY_MS = 4000;
const NOTICE_FADE_DURATION_MS = 300;

const hiding = ref(false);
const removed = ref(false);

let timers: ReturnType<typeof setTimeout>[] = [];

function clearTimers(): void {
  for (const timer of timers) clearTimeout(timer);
  timers = [];
}

watch(
  () => [props.message, props.danger] as const,
  ([message, danger]) => {
    clearTimers();
    hiding.value = false;
    removed.value = false;
    if (message.length > 0 && !danger) {
      timers.push(
        setTimeout(() => {
          hiding.value = true;
          timers.push(
            setTimeout(() => {
              removed.value = true;
            }, NOTICE_FADE_DURATION_MS + 20),
          );
        }, NOTICE_AUTO_HIDE_DELAY_MS),
      );
    }
  },
  { immediate: true },
);

onBeforeUnmount(clearTimers);
</script>

<style scoped>
.notice {
  transition: opacity 300ms ease;
}

.notice.hiding {
  opacity: 0;
}
</style>
