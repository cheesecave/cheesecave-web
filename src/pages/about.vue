<!-- src/pages/about.vue -->
<script setup>
import MarkdownPage from "@/components/common/MarkdownPage.vue";

const content = `# About CheeseCave

CheeseCave is derived from [KohakuHub](https://github.com/KohakuBlueleaf/KohakuHub), including the [DeepGHS fork](https://github.com/deepghs/KohakuHub). Original authorship and license notices are retained.

## What is CheeseCave?

CheeseCave is a self-hosted, open-source alternative to HuggingFace Hub, designed to give you complete control over your AI models, datasets, and applications. Built with modern web technologies, CheeseCave provides a powerful platform for hosting and sharing machine learning resources within your organization or community.

## Why CheeseCave?

### 🔒 Self-Hosted Control

- **Data Sovereignty**: Keep your models and datasets on your own infrastructure
- **Privacy**: No third-party access to your proprietary AI assets
- **Customization**: Modify and extend the platform to fit your needs
- **Independence**: Not dependent on external service availability or pricing

### 🚀 Modern Architecture

- **Fast**: Built with Vue 3, Vite, and modern web technologies
- **Responsive**: Beautiful UI that works on all devices
- **Git-Based**: Familiar version control workflow for ML assets
- **RESTful API**: Easy integration with your existing tools and workflows

### 🤝 Open Source

- **AGPL-3.0 Licensed**: Free to use, modify, and distribute
- **Community-Driven**: Contributions welcome from developers worldwide
- **Transparent**: All code is open and auditable
- **No Vendor Lock-In**: Your data remains accessible in standard formats

## Key Features

### Repository Management

- **Models**: Host and version your machine learning models
- **Datasets**: Share training and evaluation datasets
- **Spaces**: Deploy ML demos and applications
- **Git Integration**: Full version control for all assets

### Collaboration

- **Organizations**: Create teams and manage access
- **Private Repositories**: Control who can access your assets
- **Public Sharing**: Share your work with the community
- **Download Tracking**: See how your models are being used

### Developer-Friendly

- **CLI Tools**: Compatible with existing HuggingFace CLI tools
- **REST API**: Programmatic access to all features
- **Git LFS**: Efficient handling of large files
- **Markdown Support**: Rich documentation with README files

## Technology Stack

CheeseCave is built with:

### Frontend
- **Vue 3**: Progressive JavaScript framework
- **Vue Router**: File-based routing system
- **Pinia**: State management
- **Element Plus**: UI component library
- **UnoCSS**: Atomic CSS engine
- **Vite**: Next-generation build tool

### Backend
- **Python**: Core backend language
- **FastAPI**: Modern web framework
- **Git**: Version control engine
- **PostgreSQL**: Database (recommended)
- **Redis**: Caching and sessions

## Project History

CheeseCave was created to address the growing need for self-hosted machine learning model repositories. As AI models become increasingly important business assets, organizations need the ability to maintain complete control over their data while still benefiting from collaborative workflows.

The project aims to provide an enterprise-ready alternative to cloud-based ML platforms, with a focus on:

- **Security**: Enterprise-grade access controls
- **Performance**: Optimized for large model files
- **Scalability**: Designed to grow with your needs
- **Ease of Use**: Intuitive interface for all skill levels

## Community

### Get Involved

We welcome contributions from the community! Here's how you can participate:

- **Report Bugs**: Found an issue? Let us know on GitHub
- **Suggest Features**: Have an idea? Open a feature request
- **Contribute Code**: Submit pull requests to improve the platform
- **Documentation**: Help us improve our guides and tutorials
- **Community Support**: Help other users on Discord

### Connect With Us

- **GitHub**: [cheesecave/cheesecave-web](https://github.com/cheesecave/cheesecave-web)
- **Discord**: [Join our community](https://discord.gg/xWYrkyvJ2s)
- **Documentation**: Coming soon
- **Discussions**: GitHub Discussions

## Use Cases

### Research Labs

- Host proprietary research models
- Share datasets with collaborators
- Track model versions and experiments
- Deploy demo applications

### Enterprises

- Internal model registry
- Secure model sharing across teams
- Compliance with data regulations
- Custom deployment workflows

### AI Startups

- Version control for model iterations
- Showcase capabilities to clients
- Manage training datasets
- Deploy interactive demos

### Educational Institutions

- Teaching resources for ML courses
- Student project hosting
- Research collaboration
- Public dataset repositories

## Roadmap

We're constantly working to improve CheeseCave. Upcoming features include:

- **Model Cards**: Structured documentation for models
- **Metrics Tracking**: Model performance monitoring
- **Enhanced Search**: Advanced filtering and discovery
- **Webhooks**: Integration with CI/CD pipelines
- **Access Analytics**: Detailed usage statistics
- **Multi-Region Support**: Distributed deployments

## Support

### Self-Hosted Support

CheeseCave is designed to be self-hosted. For installation and configuration help:

- Check our documentation
- Join our Discord community
- Open an issue on GitHub

### Commercial Support

Looking for enterprise support, custom development, or professional services? Contact the project maintainers through GitHub.

## License

CheeseCave is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

This means you are free to:
- ✅ Use the software commercially
- ✅ Modify the source code
- ✅ Distribute the software
- ✅ Use it privately

With the conditions that:
- 📋 You must disclose the source code of modifications
- 📋 You must include the original license and copyright notice
- 📋 Changes must be documented
- 📋 Network use is considered distribution (AGPL requirement)

## Credits

CheeseCave is maintained by the CheeseCave project.

Upstream KohakuHub was created and maintained by:
- **KohakuBlueleaf** - Original project creator and lead developer

Special thanks to all contributors and the open-source community for their invaluable support.

## Acknowledgments

This project is inspired by HuggingFace Hub and built with the goal of providing a self-hosted alternative. We're grateful to the entire ML and open-source communities for their contributions to the tools and libraries that make CheeseCave possible.

---

**Ready to get started?** Check out our [GitHub repository](https://github.com/cheesecave/cheesecave-web) for installation instructions and documentation.
`;
</script>

<template>
  <MarkdownPage :content="content" />
</template>
