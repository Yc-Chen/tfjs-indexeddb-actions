
import '@babel/polyfill';
import * as tf from '@tensorflow/tfjs';

import { MODEL_STORE_NAME, WEIGHTS_STORE_NAME } from './globals';
import utils from './utils/utils';
import HandlerMock from './utils/HandlerMock';

// Saving in chuncks allows to store bigger models.
export default {
  db: null,

  async loadAction(path) {
    this.db = await utils.openDatabase();
    const idbModel = await this._loadModel(path);
    const modelArtifacts = await this._loadWeights(idbModel.modelArtifacts);

    this.db.close();
    return modelArtifacts;
  },

  async convertModelArtifactsToModel(modelArtifacts) {
    const handler = new HandlerMock(modelArtifacts);
    const model = await tf.loadLayersModel(handler);

    return model;
  },

  async _loadWeights(artifacts) {
    const modelArtifacts = artifacts;

    if (modelArtifacts.weightChunckKeys !== undefined) {
      const weightDataChuncked = await Promise.all(modelArtifacts.weightChunckKeys.map(async (chunckKey) => {
        const weightTx = this.db.transaction(WEIGHTS_STORE_NAME, 'readwrite');
        const weightsStore = weightTx.objectStore(WEIGHTS_STORE_NAME);
        const weightDataChunck = await utils.promisifyRequest(weightsStore.get(chunckKey));
        return weightDataChunck.weightData;
      }));

      const weightData = utils.concatenateArrayBuffers(weightDataChuncked);
      modelArtifacts.weightData = weightData;
    }

    return modelArtifacts;
  },

  async _loadModel(path) {
    const modelTx = this.db.transaction(MODEL_STORE_NAME, 'readonly');
    const modelStore = modelTx.objectStore(MODEL_STORE_NAME);
    const model = await utils.promisifyRequest(modelStore.get(path));

    if (model == null) {
      
      this.db.close();
      const error = new Error(
        `Cannot find model with path '${path}' ` +
        'in IndexedDB.');
      error.code = 404;
      throw error;
    }

    return model;
  },

  async _getModelArtifacts(url) {
    const loadHandlers = tf.io.getLoadHandlers(url);
    const modelArtifacts = await loadHandlers[0].load();

    return modelArtifacts;
  },
};