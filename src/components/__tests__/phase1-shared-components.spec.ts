// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import LoadingState from '@/components/common/LoadingState.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import StatCard from '@/components/common/StatCard.vue'
import ToastHost from '@/components/ui/ToastHost.vue'
import { BookOpen } from 'lucide-vue-next'

/**
 * Phase 1 (dashboard rebuild) rebuilds these six components' internals on
 * shadcn primitives. ~120 call sites depend on their APIs, so the APIs are
 * pinned here: props, slots, events, and accessibility roles.
 *
 * Each test mounts the component and asserts the contract a caller relies on.
 * The `data-slot` assertions prove the shadcn primitive is actually rendered,
 * not merely imported - an import without a render is the same defect as no
 * migration at all.
 *
 * Roles are asserted on the found element, never on the mount wrapper: every
 * one of these templates opens with an HTML comment, which makes the component
 * root a fragment in dev, so `wrapper.attributes()` reads the mount container
 * instead of the component.
 */
describe('shared dashboard components keep their API on shadcn internals', () => {
  describe('LoadingState', () => {
    it('keeps label/bare and renders a Skeleton with the polite live region', () => {
      const wrapper = mount(LoadingState, { props: { label: 'Loading courses', bare: true } })
      const root = wrapper.find('[role="status"]')
      expect(root.exists()).toBe(true)
      expect(root.attributes('aria-live')).toBe('polite')
      expect(wrapper.find('[data-slot="skeleton"]').exists()).toBe(true)
      expect(wrapper.find('.sr-only').text()).toBe('Loading courses')
    })
  })

  describe('EmptyState', () => {
    it('keeps title/description/icon/bare and both slots on a Card', () => {
      const wrapper = mount(EmptyState, {
        props: { title: 'No courses yet', description: 'Enroll to begin', bare: true },
        slots: { default: '<button>Browse</button>', action: '<a>Help</a>' },
      })
      expect(wrapper.find('[role="status"]').exists()).toBe(true)
      expect(wrapper.find('[data-slot="card"]').exists()).toBe(true)
      expect(wrapper.text()).toContain('No courses yet')
      expect(wrapper.text()).toContain('Enroll to begin')
      expect(wrapper.text()).toContain('Browse')
      expect(wrapper.text()).toContain('Help')
    })

    it('still defaults its icon without a caller passing one', () => {
      const wrapper = mount(EmptyState, { props: { title: 'Empty' } })
      expect(wrapper.find('svg').exists()).toBe(true)
    })
  })

  describe('ErrorState', () => {
    it('keeps title/message/bare and emits retry from an Alert', () => {
      const wrapper = mount(ErrorState, {
        props: { title: 'Failed', message: 'The server said no', bare: true },
      })
      expect(wrapper.find('[role="alert"]').exists()).toBe(true)
      expect(wrapper.find('[data-slot="alert"]').exists()).toBe(true)
      expect(wrapper.text()).toContain('Failed')
      expect(wrapper.text()).toContain('The server said no')
      expect(wrapper.text()).toContain('Try again')
      wrapper.find('button').trigger('click')
      expect(wrapper.emitted('retry')).toHaveLength(1)
    })
  })

  describe('PageHeader', () => {
    const stubs = { RouterLink: { template: '<a><slot /></a>' } }

    it('keeps title/subtitle and renders crumbs through the Breadcrumb', () => {
      const wrapper = mount(PageHeader, {
        props: {
          title: 'Courses',
          subtitle: 'Everything you teach',
          crumbs: [{ label: 'Home', to: '/' }, { label: 'Courses' }],
        },
        global: { stubs },
      })
      expect(wrapper.find('h1').text()).toBe('Courses')
      expect(wrapper.text()).toContain('Everything you teach')
      expect(wrapper.find('[data-slot="breadcrumb"]').exists()).toBe(true)
      expect(wrapper.find('[aria-current="page"]').text()).toBe('Courses')
    })

    it('keeps the actions slot', () => {
      const wrapper = mount(PageHeader, {
        props: { title: 'Courses' },
        slots: { actions: '<button>New course</button>' },
        global: { stubs },
      })
      expect(wrapper.text()).toContain('New course')
    })
  })

  describe('StatCard', () => {
    it('keeps label/value/icon/hint on a Card', () => {
      const wrapper = mount(StatCard, {
        props: { label: 'Enrolled', value: '1,204', icon: BookOpen, hint: '+12 this week' },
      })
      expect(wrapper.find('[data-slot="card"]').exists()).toBe(true)
      expect(wrapper.text()).toContain('Enrolled')
      expect(wrapper.text()).toContain('1,204')
      expect(wrapper.text()).toContain('+12 this week')
      expect(wrapper.find('svg').exists()).toBe(true)
    })
  })

  describe('ToastHost', () => {
    it('renders the store toasts as dismissible Alerts and dismisses through the store', async () => {
      setActivePinia(createPinia())
      const { useToastStore } = await import('@/stores/toast')
      const store = useToastStore()
      store.success('Enrolled', 'Welcome to SQL 101')

      const wrapper = mount(ToastHost, {
        global: { stubs: { teleport: true } },
      })
      const alerts = wrapper.findAll('[data-slot="alert"]')
      expect(alerts.length).toBe(1)
      expect(wrapper.text()).toContain('Enrolled')
      expect(wrapper.text()).toContain('Welcome to SQL 101')

      await wrapper.find('button[aria-label^="Dismiss"]').trigger('click')
      expect(store.toasts.length).toBe(0)
      store.clear()
    })
  })

  describe('no call site was touched', () => {
    it('only the six component files changed, nothing that imports them', async () => {
      const { execSync } = await import('node:child_process')
      const out = execSync('git status --short -- src/', { encoding: 'utf-8' })
      const changed = out
        .split('\n')
        .map((l) => l.trim().split(/\s+/).pop() ?? '')
        .filter(Boolean)
      const allowed = new Set([
        'src/components/common/LoadingState.vue',
        'src/components/common/EmptyState.vue',
        'src/components/common/ErrorState.vue',
        'src/components/common/PageHeader.vue',
        'src/components/common/StatCard.vue',
        'src/components/ui/ToastHost.vue',
        // Phase 1's own additions: the new shadcn primitives and this spec.
        // Anything else under src/views or src/components is a call site.
        'src/components/__tests__/phase1-shared-components.spec.ts',
      ])
      const viewChanges = changed.filter((f) => {
        if (allowed.has(f)) return false
        if (f.startsWith('src/components/public/ui/')) return false
        // Track A (landing motion) intentionally edits the landing page and
        // adds its own spec. Those are the rebuild, not call-site drift - and
        // they are pinned by landing-motion.spec.ts instead.
        if (f === 'src/views/auth/Landing.vue') return false
        if (f === 'src/views/__tests__/landing-motion.spec.ts') return false
        if (f === 'src/views/__tests__/landing-public-components.spec.ts') return false
        if (f === 'src/composables/useReducedMotion.ts') return false
        if (f === 'src/assets/main.css') return false
        return f.startsWith('src/views/') || f.startsWith('src/components/')
      })
      expect(viewChanges, `call sites changed: ${viewChanges.join(', ')}`).toEqual([])
    })
  })
})
