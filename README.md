# DICOM Vuer

A Vue.js component for viewing DICOM items in Girder.

### Usage

The ``vuetify`` and ``@girder/components`` npm packages are expected in your downstream environment.
Vuetify is expected to be installed in the Vue environment at runtime, and ``girderRest`` must be
injected into this component, and the easiest way to do that is to inject a ``RestClient`` instance.
However, you could pass any axios instance that is properly configured to communicate with the API.
If you do the latter, you do not need to install ``@girder/components`` as a peer dependency.

```vue
<script>
import GirderDicomViewer from '@girder/dicom-viewer';

export default {
  components: { GirderDicomViewer },
  data: () => ({
    files: [],
  }),
}
</script>

<template>
v-app
  girder-dicom-viewer(files="files")
</template>

```
