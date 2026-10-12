// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import fs from 'node:fs'
import path from 'node:path'

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

  describe('dashboard views carry no raw controls', () => {
    /*
      Track B completion rule. Phase 1 proved the shared components could be
      rebuilt without touching call sites; Track B intentionally rebuilds the
      call sites themselves, so that test is retired. What replaces it pins
      the finished state instead: no dashboard view renders a raw `<table`,
      a raw `<select`, or a hand-rolled status pill.

      Content scan, not git status: it holds regardless of commit state, and a
      view that regresses back to a native control fails whether it was
      committed yesterday or edited just now.
    */
    it('no raw table, select, input or pill survives in student/instructor/admin views', () => {
      const dirs = [
        path.resolve(__dirname, '..', '..', 'views', 'student'),
        path.resolve(__dirname, '..', '..', 'views', 'instructor'),
        path.resolve(__dirname, '..', '..', 'views', 'admin'),
      ]
      const offenders: string[] = []
      const walk = (d: string) => {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
          const full = path.join(d, entry.name)
          if (entry.isDirectory()) {
            walk(full)
            continue
          }
          if (!full.endsWith('.vue')) continue
          const content = fs.readFileSync(full, 'utf-8')
          if (/<table[\s>]/.test(content)) offenders.push(`${entry.name}: raw <table`)
          if (/<select[\s>]/.test(content)) offenders.push(`${entry.name}: raw <select`)
          /*
            Native radio and checkbox stay native deliberately: single-purpose,
            styled inline, and fully accessible without a component. A shadcn
            Checkbox/RadioGroup here would add indirection for no gain, and the
            status pills in CourseEditor are a checked-state pattern, not a
            missing component. `hidden` is not a control at all.
          */
          const textInputs = [...content.matchAll(/<input\b[^>]*>/g)].filter(
            (m) => !/type="(radio|checkbox|hidden)"/.test(m[0]),
          )
          if (textInputs.length) offenders.push(`${entry.name}: raw <input x${textInputs.length}`)
          if (/rounded-full px-2\.5 py-1 text-xs font-medium/.test(content))
            offenders.push(`${entry.name}: hand-rolled pill`)
        }
      }
      dirs.forEach(walk)
      expect(offenders, `\n${offenders.join('\n')}`).toEqual([])
    })
  })
})
