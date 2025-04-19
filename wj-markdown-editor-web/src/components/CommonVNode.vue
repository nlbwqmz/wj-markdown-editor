<script>
export default {
  name: 'CommonVNode',
  props: {
    content: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    return () => props.content
  },
}
</script>
