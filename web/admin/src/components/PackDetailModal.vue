<template>
  <Teleport to="body">
    <div v-if="open && pack !== null" class="modal-backdrop" @click.self="emit('close')">
      <section class="modal pack-detail-modal" role="dialog" aria-modal="true" aria-labelledby="pack-detail-title">
        <header class="modal-header">
          <h2 id="pack-detail-title">{{ t('accounts.packs.detailTitle') }}</h2>
          <button class="icon-button" type="button" :aria-label="t('actions.close')" @click="emit('close')">
            ×
          </button>
        </header>
        <div class="modal-body pack-detail-body">
          <div class="pack-detail-field">
            <span class="pack-detail-label">{{ t('accounts.packs.nameLabel') }}</span>
            <span class="pack-detail-value pack-detail-name">
              {{ pack.name }}
              <span class="status-badge neutral pack-disabled-badge">
                {{ t(pack.enabled ? 'settings.status.enabled' : 'accounts.packs.disabled') }}
              </span>
            </span>
          </div>
          <div v-if="pack.description !== null && pack.description.length > 0" class="pack-detail-field">
            <span class="pack-detail-label">{{ t('accounts.packs.detailDescription') }}</span>
            <span class="pack-detail-value">{{ pack.description }}</span>
          </div>
          <div class="pack-detail-field">
            <span class="pack-detail-label">
              {{ t('accounts.packs.detailMembers', { count: pack.sources.length }) }}
            </span>
          </div>
          <EmptyState
            v-if="pack.sources.length === 0"
            :title="t('accounts.packs.detailEmptyTitle')"
            :description="t('accounts.packs.detailEmpty')"
          />
          <ul v-else class="pack-member-list pack-detail-members">
            <li v-for="source in pack.sources" :key="source.id" class="pack-detail-source-row">
              <span class="status-badge neutral source-type-badge">
                {{ t(platformBadge(source).key) }}
              </span>
              <span class="pack-member-name">{{ sourceLabel(source) }}</span>
              <span v-if="sourceSubtitle(source).length > 0" class="muted source-cell-subtitle">
                {{ sourceSubtitle(source) }}
              </span>
            </li>
          </ul>
        </div>
        <footer class="modal-footer">
          <button type="button" @click="emit('close')">{{ t('actions.close') }}</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';

import type { SourcePackView } from '../api/admin-api';
import { t } from '../i18n';
import { platformBadge, sourceLabel, sourceSubtitle } from '../source-labels';
import EmptyState from './EmptyState.vue';

defineProps<{
  open: boolean;
  pack: SourcePackView | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    emit('close');
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
</script>
