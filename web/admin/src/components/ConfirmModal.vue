<template>
  <Teleport to="body">
    <div v-if="open" class="modal-backdrop" @click.self="emit('cancel')">
      <section class="modal" role="dialog" aria-modal="true" :aria-labelledby="titleId">
        <header class="modal-header">
          <h2 :id="titleId">{{ title }}</h2>
          <button class="icon-button" type="button" :aria-label="t('actions.close')" @click="emit('cancel')">
            ×
          </button>
        </header>
        <div class="modal-body">
          <p>{{ body }}</p>
          <p v-if="detail" class="muted">{{ detail }}</p>
        </div>
        <footer class="modal-footer">
          <button type="button" @click="emit('cancel')">{{ t('actions.cancel') }}</button>
          <button class="danger" type="button" @click="emit('confirm')">{{ t('actions.confirmDelete') }}</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';

import { t } from '../i18n';

defineProps<{
  body: string;
  detail?: string;
  open: boolean;
  title: string;
}>();

const emit = defineEmits<{
  cancel: [];
  confirm: [];
}>();

const titleId = 'confirm-modal-title';

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    emit('cancel');
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
</script>
