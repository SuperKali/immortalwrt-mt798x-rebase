<script setup>
import Toggle from './Toggle.vue'
const props = defineProps({ field: Object, modelValue: [String, Number, Boolean] })
defineEmits(['update:modelValue'])
const optKey = (o) => (Array.isArray(o) ? o[0] : o)
const optLabel = (o) => (Array.isArray(o) ? o[1] : o)
const boolVal = () => { const v = props.modelValue; return v === '1' || v === 1 || (v == null && props.field.default === '1') }
</script>

<template>
  <div v-if="field.type === 'bool'" class="flex items-center justify-between py-0.5">
    <label class="text-sm text-fg">{{ field.label }}</label>
    <Toggle :model-value="boolVal()" @update:model-value="(v) => $emit('update:modelValue', v ? '1' : '0')" />
  </div>
  <div v-else-if="field.type === 'select'">
    <label class="lk-label">{{ field.label }}</label>
    <select :value="modelValue" @change="(e) => $emit('update:modelValue', e.target.value)" class="lk-input">
      <option v-for="o in field.options" :key="optKey(o)" :value="optKey(o)">{{ optLabel(o) }}</option>
    </select>
  </div>
  <div v-else-if="field.type === 'textarea'">
    <label class="lk-label">{{ field.label }}</label>
    <textarea :value="modelValue" @input="(e) => $emit('update:modelValue', e.target.value)" rows="2" class="lk-input font-mono text-xs resize-none" :placeholder="field.placeholder || ''"></textarea>
  </div>
  <div v-else>
    <label class="lk-label">{{ field.label }}</label>
    <input :value="modelValue" @input="(e) => $emit('update:modelValue', e.target.value)"
      :type="field.type === 'password' ? 'password' : (field.type === 'number' ? 'number' : 'text')" :placeholder="field.placeholder || ''" class="lk-input" />
  </div>
</template>
