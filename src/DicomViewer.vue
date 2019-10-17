<template lang="pug">
v-col
  .dicom-image
  div(v-if="index >= 0") {{ index + 1 }} of {{ files.length }} &mdash; {{ files[index].name }}
  v-slider.mx-1(:min="0", :max="files.length - 1", v-model="index")
  v-row(justify="center")
    v-btn.mx-1(@click="index = 0", :disabled="index <= 0")
      v-icon mdi-rewind
    v-btn.mx-1(@click="index = Math.max(0, index - 1)", :disabled="index <= 0")
      v-icon mdi-skip-previous
    v-btn.mx-1(@click="index = Math.min(index + 1, files.length - 1)",
        :disabled="index >= files.length - 1")
      v-icon mdi-skip-next
    v-btn.mx-1(@click="index = files.length - 1", :disabled="index >= files.length - 1")
      v-icon mdi-fast-forward
  v-progress-linear(v-show="loading", indeterminate)
  table(v-if="tags.length")
    thead
      tr
        th Tag
        th Value
    tbody
      tr(v-for="tag in tags")
        td {{ tag.name }}
        td {{ tag.value }}
</template>

<script>
import daikon from 'daikon';
import vtkImageSlice from 'vtk.js/Sources/Rendering/Core/ImageSlice';
import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkImageMapper from 'vtk.js/Sources/Rendering/Core/ImageMapper';
import vtkInteractorStyleImage from 'vtk.js/Sources/Interaction/Style/InteractorStyleImage';
import vtkOpenGLRenderWindow from 'vtk.js/Sources/Rendering/OpenGL/RenderWindow';
import vtkRenderer from 'vtk.js/Sources/Rendering/Core/Renderer';
import vtkRenderWindow from 'vtk.js/Sources/Rendering/Core/RenderWindow';
import vtkRenderWindowInteractor from 'vtk.js/Sources/Rendering/Core/RenderWindowInteractor';

const defaultFileFetch = async file => (await this.girderRest.get(`file/${file._id}/download`, {
  responseType: 'arraybuffer',
})).data;

const extractImageData = (data) => {
  const [cspace, rspace] = data.getPixelSpacing();
  const imageData = vtkImageData.newInstance();
  imageData.setOrigin(0, 0, 0);
  imageData.setSpacing(cspace, rspace, 1);
  imageData.setExtent(0, data.getCols() - 1, 0, data.getRows() - 1, 0, 0);

  const values = data.getInterpretedData();
  const dataArray = vtkDataArray.newInstance({ values });
  imageData.getPointData().setScalars(dataArray);

  return imageData;
};

const filterTags = tags => tags.filter(
  tag => !tag.sublist
    && tag.vr !== 'SQ'
    && !tag.isPixelData()
    && tag.value,
)
  .map(({ group, element, value }) => ({
    name: daikon.Dictionary.getDescription(group, element),
    value: value.join(', '),
  }))
  .sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1));

export default {
  inject: ['girderRest'],
  props: {
    // Array of files. The default behavior assumes each element is a Girder file Object
    files: {
      type: Array,
      required: true,
    },
    // Alternative async function to map a file in the files Array to its data
    fetchDataFunction: {
      type: Function,
      default: () => defaultFileFetch,
    },
    useCache: {
      type: Boolean,
      default: true,
    },
  },
  data: () => ({
    index: -1,
    image: null,
    loading: false,
    tags: [],
  }),
  watch: {
    async index(i) {
      // TODO limit size of cache? Eviction policy?
      const cached = this.useCache ? this.cache[this.files[i]._id] : false;
      if (cached) {
        this.image = cached.image;
        this.tags = cached.tags;
      } else {
        try {
          this.loading = true;
          const data = await this.fetchDataFunction(this.files[i]);
          this.image = daikon.Series.parseImage(new DataView(data));
          this.tags = filterTags(Object.values(this.image.tags));
          if (this.useCache) {
            this.cache[this.files[i]._id] = {
              image: this.image, // TODO should we instead cache result of extractImageData?
              tags: this.tags,
            };
          }
        } catch (error) {
          this.$emit('error:load', {error, file: this.files[i], i });
        } finally {
          this.loading = false;
        }
      }
    },
    image(data) {
      const mapper = vtkImageMapper.newInstance();
      const imageData = extractImageData(data);
      mapper.setInputData(imageData);
      this.vtk.actor.setMapper(mapper);

      if (!this.started) {
        this.autoZoom();
        this.autoLevel(imageData);
        this.vtk.interactor.initialize();
        this.vtk.interactor.bindEvents(this.$el.querySelector('.dicom-image'));
        this.vtk.interactor.start();
        this.started = true;
      }
      this.vtk.interactor.render();
    },
  },
  mounted() {
    this.cache = {};
    this.vtk = {};
    this.vtk.renderer = vtkRenderer.newInstance();
    this.vtk.renderer.setBackground(0.33, 0.33, 0.33);

    const renWin = vtkRenderWindow.newInstance();
    renWin.addRenderer(this.vtk.renderer);

    const glWin = vtkOpenGLRenderWindow.newInstance();
    glWin.setContainer(this.$el.querySelector('.dicom-image'));
    glWin.setSize(512, 512);
    renWin.addView(glWin);

    this.vtk.interactor = vtkRenderWindowInteractor.newInstance();
    const style = vtkInteractorStyleImage.newInstance();
    this.vtk.interactor.setInteractorStyle(style);
    this.vtk.interactor.setView(glWin);

    this.vtk.actor = vtkImageSlice.newInstance();
    this.vtk.renderer.addActor(this.vtk.actor);

    this.vtk.camera = this.vtk.renderer.getActiveCameraAndResetIfCreated();
    this.started = false;
    this.index = 0;
  },
  methods: {
    autoLevel(imageData) {
      const [min, max] = imageData.getPointData().getScalars().getRange();
      this.vtk.actor.getProperty().setColorWindow(max - min);
      this.vtk.actor.getProperty().setColorLevel((min + max) / 2);
    },
    autoZoom() {
      this.vtk.renderer.resetCamera();
      this.vtk.camera.zoom(1.44);

      const up = [0, -1, 0];
      const pos = this.vtk.camera.getPosition();
      if (pos[2] > 0) {
        pos[2] = -pos[2];
      }
      this.vtk.camera.setViewUp(...up);
      this.vtk.camera.setPosition(...pos);
    },
  },
};
</script>
