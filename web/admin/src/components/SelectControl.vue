<script setup lang="ts" generic="T extends string">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

interface SelectOption<V extends string = string> {
  label: string;
  value: V;
}

const props = defineProps<{
  ariaLabel?: string;
  disabled?: boolean;
  modelValue: T;
  options: SelectOption<T>[];
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: T): void;
}>();

const isOpen = ref(false);
const rootRef = ref<HTMLElement | null>(null);
const activeIndex = ref(0);

const selectedOption = computed(
  () => props.options.find((option) => option.value === props.modelValue) ?? props.options[0],
);

watch(isOpen, (open) => {
  if (open) {
    activeIndex.value = Math.max(
      0,
      props.options.findIndex((option) => option.value === props.modelValue),
    );
    document.addEventListener('mousedown', handleDocumentMouseDown);
    return;
  }

  document.removeEventListener('mousedown', handleDocumentMouseDown);
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleDocumentMouseDown);
});

function toggleOpen(): void {
  if (props.disabled) {
    return;
  }

  isOpen.value = !isOpen.value;
}

function selectOption(option: SelectOption<T>): void {
  emit('update:modelValue', option.value);
  isOpen.value = false;
}

function handleDocumentMouseDown(event: MouseEvent): void {
  if (rootRef.value !== null && !rootRef.value.contains(event.target as Node)) {
    isOpen.value = false;
  }
}

function handleTriggerKeydown(event: KeyboardEvent): void {
  if (props.disabled) {
    return;
  }

  if (event.key === 'Escape') {
    isOpen.value = false;
    return;
  }

  if (
    event.key !== 'ArrowDown' &&
    event.key !== 'ArrowUp' &&
    event.key !== 'Enter' &&
    event.key !== ' '
  ) {
    return;
  }

  event.preventDefault();

  if (!isOpen.value) {
    isOpen.value = true;
    return;
  }

  if (event.key === 'ArrowDown') {
    activeIndex.value = (activeIndex.value + 1) % props.options.length;
    return;
  }

  if (event.key === 'ArrowUp') {
    activeIndex.value = (activeIndex.value - 1 + props.options.length) % props.options.length;
    return;
  }

  const option = props.options[activeIndex.value];

  if (option !== undefined) {
    selectOption(option);
  }
}
</script>

<template>
  <div ref="rootRef" class="select-control" :class="{ open: isOpen, disabled }">
    <button
      type="button"
      class="select-trigger"
      :aria-label="ariaLabel"
      aria-haspopup="listbox"
      :aria-expanded="isOpen"
      :disabled="disabled"
      @click="toggleOpen"
      @keydown="handleTriggerKeydown"
    >
      <span>{{ selectedOption?.label ?? '' }}</span>
      <svg
        class="select-chevron"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
    <ul v-if="isOpen" class="select-menu" role="listbox">
      <li v-for="(option, index) in options" :key="option.value">
        <button
          type="button"
          class="select-option"
          :class="{ active: option.value === modelValue, focused: index === activeIndex }"
          role="option"
          :aria-selected="option.value === modelValue"
          @click="selectOption(option)"
        >
          {{ option.label }}
        </button>
      </li>
    </ul>
  </div>
</template>
