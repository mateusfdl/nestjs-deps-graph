import { INestApplication } from '@nestjs/common';
import { SerializedGraph } from '@nestjs/core';
import * as http from 'http';
import { promisify } from 'util';
import { deflate } from 'zlib';
import { Edge } from './edge';
import { Node } from './node';
import { Config } from './config';

export class NestGraphExplorer {
  private nodes: Node[];
  private edges: Edge[];
  private compressor = promisify(deflate)

  constructor(
    private readonly app: INestApplication,
    private readonly config: Config,
  ) {
    this.nodes = [];
    this.edges = [];
  }

  async run() {
    this.handleNodesAndEdges(this.handleGraph());
    this.startServer();
  }

  handleGraph() {
    const instance = this.app.get(SerializedGraph);
    return instance.toJSON();
  }

  handleNodesAndEdges(data: any) {
    const edges = data.edges;

    const moduleToModuleEdges = Object.values(edges)
      .filter(
        (edge: any) =>
          edge.metadata.type === 'module-to-module' &&
          edge.metadata.targetModuleName != 'InternalCoreModule',
      )
      .map((edge: any) => {
        return {
          source: edge.source,
          target: edge.target,
        };
      });

    const nodes: Node[] = [];

    for (const edge of moduleToModuleEdges) {
      const target = data.nodes[edge.target];
      const source = data.nodes[edge.source];
      nodes.push({
        id: target.id,
        label: target.label,
      });
      nodes.push({
        id: source.id,
        label: source.label,
      });
    }

    const uniqueNodes = Array.from(new Set(nodes.map((a) => a.id))).map(
      (id) => {
        return nodes.find((a) => a.id === id);
      },
    );

    this.edges = moduleToModuleEdges;
    this.nodes = uniqueNodes as Node[]
  }

  private startServer() {
    const server = http.createServer((req, res: any) => {
      switch (req.url) {
        case '/api/nodes':
          res.writeHead(200, { 'Content-Type': 'application/json' });
          const nr = JSON.stringify(this.nodes);
          if (this.config.compress) {
            res.write(this.compressor(nr))
          } else {
            res.write(nr)
          }
          res.write();
          res.end();
          break;
        case '/api/edges':
          res.writeHead(200, { 'Content-Type': 'application/json' });
          const er = JSON.stringify(this.edges);
          if (this.config.compress) {
            res.write(this.compressor(er))
          } else {
            res.write(er)
          }
          res.end();
          break;
        default:
          res.writeHead(404);
          res.end();
      }
    });

    server.listen(this.config.port);
  }
}
