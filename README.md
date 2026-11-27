# WorldRehearsal

[Project website](https://worldrehearsal.github.io/)

## Abstract

World models aim to simulate environments that respond to actions and remain coherent over time. Yet pretrained video models face a trade-off between visual fidelity and their ability to follow instructions reliably and preserve scene consistency over long interactions. We introduce WorldRehearsal, a training-free agent system that separates world reasoning and memory from visual generation. The system harness interprets instructions, plans motion, and maintains a persistent world state, while a frozen video model synthesizes visual observations. Visual references and prompts convey the agent’s plans and memory to the generator, whose outputs inform subsequent interactions. Across five backbones, WorldRehearsal achieves average improvements of 31.84 pts in navigation and 36.92 pts in scene revisits, while largely preserving average image quality. These results demonstrate its ability to enhance control and memory across diverse pretrained world models without additional training.
